"""
log_processor/run_intelligence/event_log_fetcher.py
══════════════════════════════════════════════════════════════════════════════
Three event log sources:

  A. Cluster Events API   — infrastructure events (node loss, scaling, driver)
                            ALWAYS available; zero configuration required.
  B. DLT Event Log SQL    — Delta table at <pipeline_storage>/system/events
                            ALWAYS available for any pipeline that has run.
  C. Job Run Output API   — stdout/stderr tail from /api/2.1/jobs/runs/get-output
                            Available when Volume logs are NOT present.

All settings (event types, limits, timeouts) come from
config.run_intelligence_settings.
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


# ── A. Cluster Events API ─────────────────────────────────────────────────────

def fetch_cluster_events(
    cluster_id: str,
    start_ms: int,
    end_ms: int,
    host: str,
    token: str,
) -> list[dict]:
    """
    Fetch cluster-level events from the Databricks Cluster Events API.

    Args:
        cluster_id: The Databricks cluster ID.
        start_ms:   Epoch milliseconds — start of the run window.
        end_ms:     Epoch milliseconds — end of the run window.
        host:       Databricks workspace URL.
        token:      Personal access token or OAuth token.

    Returns:
        List of event dicts.  Empty list on error.
    """
    from config.run_intelligence_settings import (
        RIE_CLUSTER_EVENTS_ENABLED,
        RIE_CLUSTER_EVENT_TYPES,
        RIE_CLUSTER_EVENTS_LIMIT,
    )

    if not RIE_CLUSTER_EVENTS_ENABLED:
        return []

    url = f"{host.rstrip('/')}/api/2.0/clusters/events"
    headers = {"Authorization": f"Bearer {token}"}
    body: dict[str, Any] = {
        "cluster_id":  cluster_id,
        "start_time":  start_ms,
        "end_time":    end_ms,
        "event_types": RIE_CLUSTER_EVENT_TYPES,
        "limit":       RIE_CLUSTER_EVENTS_LIMIT,
    }

    try:
        resp = requests.post(url, json=body, headers=headers, timeout=30)
        resp.raise_for_status()
        events = resp.json().get("events", [])
        logger.info(f"[event_log_fetcher] cluster_events: {len(events)} events for {cluster_id}")
        return events
    except Exception as e:
        logger.warning(f"[event_log_fetcher] fetch_cluster_events failed: {e}")
        return []


# ── B. DLT Event Log SQL ──────────────────────────────────────────────────────

def fetch_dlt_event_log(
    pipeline_id: str,
    update_id: str,
    storage_location: str,
    host: str,
    token: str,
    warehouse_id: str,
    use_named_table: bool = True,
    pipeline_name: str = "",
) -> dict[str, Any]:
    """
    Fetch DLT event log entries for a specific pipeline update.

    Strategy:
      1. If use_named_table=True and the UC table exists → query the table.
      2. Otherwise → query directly via delta.`<storage_location>/system/events`.

    Returns a dict with:
        events        – list of all events (limit 1000)
        errors        – ERROR + WARN events only
        flow_progress – flow_progress events with metrics
        dq_events     – data quality events
        _source       – "named_table" | "delta_path" | "error"
    """
    from config.run_intelligence_settings import RIE_QUERY_TIMEOUT_SECONDS
    from .dlt_event_publisher import dlt_table_exists, get_named_table_fqn

    result: dict[str, Any] = {
        "events":        [],
        "errors":        [],
        "flow_progress": [],
        "dq_events":     [],
        "_source":       "error",
    }

    # Decide query target
    if use_named_table:
        table_fqn = get_named_table_fqn(pipeline_id, pipeline_name)
        if dlt_table_exists(table_fqn, host, token, warehouse_id):
            query_target = f"`{table_fqn}`"
            result["_source"] = "named_table"
        else:
            query_target = f"delta.`{storage_location.rstrip('/')}/system/events`"
            result["_source"] = "delta_path"
    else:
        query_target = f"delta.`{storage_location.rstrip('/')}/system/events`"
        result["_source"] = "delta_path"

    def _q(sql: str) -> list[dict]:
        from .system_table_fetcher import _run_sql
        try:
            return _run_sql(sql, host, token, warehouse_id, RIE_QUERY_TIMEOUT_SECONDS)
        except Exception as e:
            logger.warning(f"[fetch_dlt_event_log] query failed: {e}")
            return []

    # All events
    result["events"] = _q(f"""
        SELECT id, timestamp, level, event_type, message, error, details, maturity_level
        FROM   {query_target}
        WHERE  origin.update_id = '{update_id}'
        ORDER BY timestamp
        LIMIT  1000
    """)

    # Errors and warnings
    result["errors"] = _q(f"""
        SELECT timestamp, level, event_type, message, error
        FROM   {query_target}
        WHERE  origin.update_id = '{update_id}'
          AND  level IN ('ERROR', 'WARN')
        ORDER BY timestamp
    """)

    # Flow progress metrics
    result["flow_progress"] = _q(f"""
        SELECT timestamp, event_type,
               details:flow_progress.status                        AS flow_status,
               details:flow_progress.metrics.num_output_rows       AS num_output_rows,
               details:flow_progress.metrics.num_input_rows        AS num_input_rows,
               details:flow_progress.data_quality.dropped_records  AS dropped_records,
               origin.flow_name                                    AS flow_name
        FROM   {query_target}
        WHERE  origin.update_id = '{update_id}'
          AND  event_type = 'flow_progress'
        ORDER BY timestamp
    """)

    # DQ events
    result["dq_events"] = _q(f"""
        SELECT timestamp, event_type, details:flow_progress.data_quality AS dq_metrics,
               origin.flow_name AS flow_name
        FROM   {query_target}
        WHERE  origin.update_id = '{update_id}'
          AND  details:flow_progress.data_quality IS NOT NULL
        ORDER BY timestamp
    """)

    return result


# ── C. Job Run Output API ─────────────────────────────────────────────────────

def fetch_job_run_output(
    run_id: str,
    host: str,
    token: str,
) -> dict[str, Any]:
    """
    Fetch stdout/stderr tail from the Job Run Output API.
    Useful as a fallback when Volume log files are not present.

    Returns:
        logs         – stdout/stderr as a string (up to ~1 MB)
        error        – error message if the run failed
        error_trace  – stack trace if available
        metadata     – run metadata dict
        _available   – bool
    """
    from config.run_intelligence_settings import RIE_JOB_RUN_OUTPUT_ENABLED

    empty = {"logs": "", "error": "", "error_trace": "", "metadata": {}, "_available": False}

    if not RIE_JOB_RUN_OUTPUT_ENABLED:
        return empty

    url = f"{host.rstrip('/')}/api/2.1/jobs/runs/get-output"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        resp = requests.get(url, params={"run_id": run_id}, headers=headers, timeout=30)
        resp.raise_for_status()
        body = resp.json()
        return {
            "logs":        body.get("logs", ""),
            "error":       body.get("error", ""),
            "error_trace": body.get("error_trace", ""),
            "metadata":    body.get("metadata", {}),
            "_available":  True,
        }
    except requests.exceptions.HTTPError as e:
        # 400 is expected for non-notebook runs (Python wheel, JAR, DLT) — not an error
        logger.debug(f"[fetch_job_run_output] not available for run {run_id}: {e}")
        return empty
    except Exception as e:
        logger.debug(f"[fetch_job_run_output] skipped for run {run_id}: {e}")
        return empty


def fetch_run_metadata_from_api(run_id: str, host: str, token: str) -> dict:
    """
    Fetch full run metadata from /api/2.1/jobs/runs/get.
    Returns cluster_instance.cluster_id, spark_context_id, state, etc.
    """
    url = f"{host.rstrip('/')}/api/2.1/jobs/runs/get"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, params={"run_id": run_id}, headers=headers, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"[fetch_run_metadata_from_api] run {run_id}: {e}")
        return {}


def fetch_pipeline_info_from_api(pipeline_id: str, host: str, token: str) -> dict:
    """
    Fetch DLT pipeline metadata from /api/2.0/pipelines/<id>.
    Returns the 'storage' field (needed to find the event log Delta table path).
    """
    url = f"{host.rstrip('/')}/api/2.0/pipelines/{pipeline_id}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"[fetch_pipeline_info_from_api] pipeline {pipeline_id}: {e}")
        return {}
