"""
log_processor/run_intelligence/system_table_fetcher.py
══════════════════════════════════════════════════════════════════════════════
Queries system.lakeflow.* and system.billing.* tables.

Column names are based on ACTUAL workspace schema (verified live):

  job_run_timeline columns:
    job_id, run_id, run_name, run_type, result_state,
    period_start_time, period_end_time, compute, compute_ids

  job_task_run_timeline columns:
    job_id, run_id, task_key, result_state, attempt_number,
    compute, compute_ids, period_start_time, period_end_time

  pipeline_update_timeline columns:
    pipeline_id, update_id, update_type, result_state,
    request_id, account_id  (NO state, NO timestamps)

  system.compute.clusters columns:
    cluster_id, policy_id, workspace_id, account_id, create_time
    (NOT node_type_id / num_workers — use cluster_id only)
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ── Internal SQL runner ───────────────────────────────────────────────────────

def _run_sql(sql: str, host: str, token: str, warehouse_id: str,
             timeout_s: int = 300) -> list[dict]:
    """Execute SQL via Databricks REST API /api/2.0/sql/statements."""
    import requests, time

    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    base = host.rstrip("/")

    resp = requests.post(
        f"{base}/api/2.0/sql/statements",
        headers=headers,
        json={
            "statement": sql,
            "warehouse_id": warehouse_id,
            "wait_timeout": f"{min(timeout_s, 50)}s",
            "on_wait_timeout": "CONTINUE",  # <-- FIX: Don't kill the query, let it continue so we can poll
            "format": "JSON_ARRAY",
        },
        timeout=timeout_s + 10,
    )
    resp.raise_for_status()
    body = resp.json()

    stmt_id = body.get("statement_id")
    deadline = time.time() + timeout_s
    while body.get("status", {}).get("state") in ("PENDING", "RUNNING"):
        if time.time() > deadline:
            raise TimeoutError(f"SQL statement {stmt_id} timed out after {timeout_s}s")
        time.sleep(2)
        poll = requests.get(f"{base}/api/2.0/sql/statements/{stmt_id}",
                            headers=headers, timeout=15)
        poll.raise_for_status()
        body = poll.json()

    state = body.get("status", {}).get("state", "UNKNOWN")
    if state == "SUCCEEDED":
        cols = [c["name"] for c in body.get("manifest", {}).get("schema", {}).get("columns", [])]
        rows = body.get("result", {}).get("data_array", []) or []
        return [dict(zip(cols, row)) for row in rows]
    else:
        err = body.get("status", {}).get("error", {})
        raise RuntimeError(f"SQL failed ({state}): {err.get('message', 'unknown error')}")


def _describe_table(table: str, host: str, token: str, warehouse_id: str) -> list[str]:
    """Return list of column names for a table. Used for schema discovery."""
    try:
        rows = _run_sql(f"DESCRIBE {table}", host, token, warehouse_id, timeout_s=20)
        return [r.get("col_name", "") for r in rows if r.get("col_name", "").strip()]
    except Exception:
        return []


def _parse_compute_config(compute_raw) -> dict:
    """
    Parse the 'compute' column from job_run_timeline into a cluster_config dict.
    Handles: classic cluster specs, serverless, null/empty, string JSON, list.
    """
    import json
    if not compute_raw:
        return {}

    if isinstance(compute_raw, str):
        try:
            compute_raw = json.loads(compute_raw)
        except (json.JSONDecodeError, ValueError):
            return {}

    # job_run_timeline.compute is typically an array — take first element
    if isinstance(compute_raw, list):
        compute_raw = compute_raw[0] if compute_raw else {}

    if not isinstance(compute_raw, dict):
        return {}

    # ── Serverless detection ─────────────────────────────────────────────────
    kind = str(compute_raw.get("kind", "")).upper()
    if kind in ("SERVERLESS", "SERVERLESS_JOB", "SERVERLESS_DLT") or compute_raw.get("serverless"):
        return {"is_serverless": True, "compute_kind": kind or "SERVERLESS"}

    # ── Classic cluster spec ─────────────────────────────────────────────────
    # Spec may be nested under "cluster_spec" or at the top level
    spec = compute_raw.get("cluster_spec", compute_raw)
    if not isinstance(spec, dict):
        spec = compute_raw

    return {
        "is_serverless":       False,
        "compute_kind":        "CLASSIC",
        "driver_node_type_id": spec.get("driver_node_type_id") or spec.get("driver_node_type") or "",
        "node_type_id":        spec.get("node_type_id")        or spec.get("node_type")        or "",
        "num_workers":         spec.get("num_workers"),
        "autoscale":           spec.get("autoscale"),
        "spark_version":       spec.get("spark_version", ""),
        "runtime_engine":      spec.get("runtime_engine", ""),
        "data_security_mode":  spec.get("data_security_mode", ""),
    }


# ── Job system table queries ──────────────────────────────────────────────────

def fetch_job_system_tables(
    job_id: str,
    run_id: str,
    host: str,
    token: str,
    warehouse_id: str,
    timeout_s: int = 300,
    baseline_type: str = "Last Successful Run",
    baseline_run_id: str = "",
) -> dict[str, Any]:
    """
    Fetch system table data for a specific Databricks job run.
    Only uses columns confirmed present in the workspace schema.
    """
    from config.run_intelligence_settings import (
        RIE_ST_JOB_RUN_TIMELINE,
        RIE_ST_JOB_TASK_RUN_TIMELINE,
        RIE_ST_BILLING_USAGE,
        RIE_ST_BILLING_LIST_PRICES,
    )

    result: dict[str, Any] = {
        "run_summary":    {},
        "task_breakdown": [],
        "cluster_config": {},
        "cost_breakdown": [],
        "baseline_run":   {},
        "_errors":        [],
    }

    def safe(label: str, sql: str):
        try:
            return _run_sql(sql, host, token, warehouse_id, timeout_s)
        except Exception as e:
            logger.warning(f"[system_table_fetcher] {label} failed: {e}")
            result["_errors"].append({"query": label, "error": str(e)})
            return []

    # Run summary — includes compute column for cluster config extraction
    rows = safe("run_summary", f"""
        SELECT job_id, run_id, run_name, run_type, result_state,
               period_start_time, period_end_time,
               TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds,
               compute
        FROM   {RIE_ST_JOB_RUN_TIMELINE}
        WHERE  job_id = '{job_id}' AND run_id = '{run_id}'
        LIMIT 1
    """)
    if rows:
        result["run_summary"] = rows[0]
        # First parse from compute column as a baseline
        baseline_cc = _parse_compute_config(rows[0].get("compute"))

        # If already identified as serverless, trust the compute column — do NOT
        # override it with the classic enrichment query (serverless runs can still
        # return ephemeral cluster_id values that would fool the check below).
        if baseline_cc.get("is_serverless"):
            result["cluster_config"] = baseline_cc
        else:
            # Try to enrich cluster config from task timeline (works for classic compute)
            cluster_rows = safe("cluster_config", f"""
                SELECT DISTINCT
                    tc.compute_info.cluster_id   AS cluster_id,
                    c.dbr_version,
                    c.driver_node_type           AS driver_node_type_id
                FROM (
                    SELECT EXPLODE(compute) AS compute_info
                    FROM   {RIE_ST_JOB_TASK_RUN_TIMELINE}
                    WHERE  job_id = '{job_id}' AND job_run_id = '{run_id}'
                      AND  compute IS NOT NULL
                ) tc
                LEFT JOIN system.compute.clusters c
                  ON tc.compute_info.cluster_id = c.cluster_id
                LIMIT 1
            """)

            if cluster_rows and cluster_rows[0].get("cluster_id"):
                cc = cluster_rows[0]
                result["cluster_config"] = {
                    "is_serverless":       False,
                    "compute_kind":        "CLASSIC",
                    "cluster_id":          cc.get("cluster_id", ""),
                    "driver_node_type_id": cc.get("driver_node_type_id") or baseline_cc.get("driver_node_type_id", ""),
                    "node_type_id":        baseline_cc.get("node_type_id", ""),        # Not in clusters table
                    "runtime_engine":      baseline_cc.get("runtime_engine", ""),      # Not in clusters table
                    "num_workers":         baseline_cc.get("num_workers"),              # Not in clusters table
                    "autoscale":           baseline_cc.get("autoscale"),                # Not in clusters table
                    "spark_version":       cc.get("dbr_version") or baseline_cc.get("spark_version", ""),
                    "data_security_mode":  baseline_cc.get("data_security_mode", ""),
                }
            else:
                # No classic cluster found — use parsed baseline
                result["cluster_config"] = baseline_cc

    # Task breakdown
    result["task_breakdown"] = safe("task_breakdown", f"""
        SELECT task_key, result_state,
               period_start_time, period_end_time,
               TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
        FROM   {RIE_ST_JOB_TASK_RUN_TIMELINE}
        WHERE  job_id = '{job_id}' AND job_run_id = '{run_id}'
        ORDER BY period_start_time
    """)

    # Cost breakdown — uses usage_metadata (works for classic AND serverless)
    # Correct price column: pricing.effective_list.default with time-bounded join
    _run_start = result["run_summary"].get("period_start_time", "")
    _date_filter = ""
    if _run_start:
        try:
            import datetime
            # Handle various ISO formats
            rs_clean = _run_start.replace("Z", "+00:00")
            dt = datetime.datetime.fromisoformat(rs_clean)
            start_str = (dt - datetime.timedelta(days=2)).strftime("%Y-%m-%d")
            end_str   = (dt + datetime.timedelta(days=2)).strftime("%Y-%m-%d")
            _date_filter = f"  AND u.usage_date >= '{start_str}' AND u.usage_date <= '{end_str}'"
        except Exception as e:
            logger.warning(f"Could not parse run_start '{_run_start}' for date filter: {e}")
    
    result["cost_breakdown"] = safe("cost_breakdown", f"""
        SELECT
            u.sku_name,
            COALESCE(u.usage_metadata.node_type, '') AS node_type,
            ROUND(SUM(u.usage_quantity), 4)                                    AS total_dbus,
            ROUND(MAX(p.pricing.effective_list.default), 4)                    AS price_per_dbu_usd,
            ROUND(SUM(u.usage_quantity * p.pricing.effective_list.default), 4) AS cost_usd
        FROM   {RIE_ST_BILLING_USAGE} u
        LEFT JOIN {RIE_ST_BILLING_LIST_PRICES} p
          ON   u.sku_name = p.sku_name
          AND  u.cloud    = p.cloud
          AND  u.usage_start_time >= p.price_start_time
          AND  (p.price_end_time IS NULL OR u.usage_start_time < p.price_end_time)
        WHERE  u.usage_metadata.job_id     = '{job_id}'
          AND  u.usage_metadata.job_run_id = '{run_id}'
        {_date_filter}
        GROUP BY u.sku_name, u.usage_metadata.node_type
    """)

    baseline_rows = []
    if baseline_type == "None":
        pass
    elif baseline_type == "Specific Run ID" and baseline_run_id:
        baseline_rows = safe("baseline_run", f"""
            SELECT run_id, period_start_time, period_end_time, result_state,
                   TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  job_id = '{job_id}' AND run_id = '{baseline_run_id}'
            LIMIT 1
        """)
    elif baseline_type == "Previous Run":
        baseline_rows = safe("baseline_run", f"""
            SELECT run_id, period_start_time, period_end_time, result_state,
                   TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  job_id       = '{job_id}'
              AND  run_id      != '{run_id}'
            ORDER BY period_start_time DESC
            LIMIT 1
        """)
    else:
        # Last Successful Run (Default)
        baseline_rows = safe("baseline_run", f"""
            SELECT run_id, period_start_time, period_end_time, result_state,
                   TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  job_id       = '{job_id}'
              AND  run_id      != '{run_id}'
              AND  result_state = 'SUCCEEDED'
            ORDER BY period_start_time DESC
            LIMIT 1
        """)

    if baseline_rows:
        result["baseline_run"] = baseline_rows[0]

    return result


# ── Pipeline system table queries ─────────────────────────────────────────────

def fetch_pipeline_system_tables(
    pipeline_id: str,
    update_id: str,
    host: str,
    token: str,
    warehouse_id: str,
    timeout_s: int = 300,
    baseline_type: str = "Last Successful Run",
    baseline_run_id: str = "",
) -> dict[str, Any]:
    """
    Fetch system table data for a specific DLT pipeline update.
    Uses only columns confirmed present in the workspace schema.
    """
    from config.run_intelligence_settings import (
        RIE_ST_PIPELINE_UPDATE_TIMELINE,
        RIE_ST_PIPELINE_DATASET_TIMELINE,
        RIE_ST_PIPELINE_FLOW_TIMELINE,
        RIE_ST_PIPELINE_EXPECT_TIMELINE,
        RIE_ST_BILLING_USAGE,
        RIE_ST_BILLING_LIST_PRICES,
    )

    result: dict[str, Any] = {
        "update_summary":  {},
        "dataset_metrics": [],
        "flow_metrics":    [],
        "expectations":    [],
        "cluster_config":  {},
        "cost_breakdown":  [],
        "baseline_update": {},
        "_errors":         [],
    }

    def safe(label: str, sql: str):
        try:
            return _run_sql(sql, host, token, warehouse_id, timeout_s)
        except Exception as e:
            logger.warning(f"[system_table_fetcher] {label} failed: {e}")
            result["_errors"].append({"query": label, "error": str(e)})
            return []

    # Update summary — only confirmed columns (no timestamps in this table)
    rows = safe("update_summary", f"""
        SELECT pipeline_id, update_id, update_type, result_state, request_id
        FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
        WHERE  pipeline_id = '{pipeline_id}' AND update_id = '{update_id}'
        LIMIT 1
    """)
    if rows:
        result["update_summary"] = rows[0]

    # Dataset metrics
    result["dataset_metrics"] = safe("dataset_metrics", f"""
        SELECT dataset_name, dataset_type, num_output_rows,
               backlog_bytes, backlog_files
        FROM   {RIE_ST_PIPELINE_DATASET_TIMELINE}
        WHERE  pipeline_id = '{pipeline_id}' AND update_id = '{update_id}'
        ORDER BY num_output_rows DESC NULLS LAST
    """)

    # Flow metrics
    result["flow_metrics"] = safe("flow_metrics", f"""
        SELECT flow_name, status, num_output_rows
        FROM   {RIE_ST_PIPELINE_FLOW_TIMELINE}
        WHERE  pipeline_id = '{pipeline_id}' AND update_id = '{update_id}'
        ORDER BY flow_name
    """)

    # Data quality expectations
    result["expectations"] = safe("expectations", f"""
        SELECT expectation_name, passed_records, failed_records,
               CASE
                 WHEN (passed_records + failed_records) > 0
                 THEN ROUND(failed_records * 100.0 / (passed_records + failed_records), 2)
                 ELSE 0
               END AS failure_pct
        FROM   {RIE_ST_PIPELINE_EXPECT_TIMELINE}
        WHERE  pipeline_id = '{pipeline_id}' AND update_id = '{update_id}'
        ORDER BY failed_records DESC NULLS LAST
    """)

    # Cost breakdown — 90-day safety lookback prevents full billing table scan
    result["cost_breakdown"] = safe("cost_breakdown", f"""
        SELECT u.sku_name,
               COALESCE(u.usage_metadata.node_type, '') AS node_type,
               ROUND(SUM(u.usage_quantity), 4)                                    AS total_dbus,
               ROUND(MAX(p.pricing.effective_list.default), 4)                    AS price_per_dbu_usd,
               ROUND(SUM(u.usage_quantity * p.pricing.effective_list.default), 4) AS cost_usd
        FROM   {RIE_ST_BILLING_USAGE} u
        LEFT JOIN {RIE_ST_BILLING_LIST_PRICES} p
          ON   u.sku_name = p.sku_name
          AND  u.cloud    = p.cloud
          AND  u.usage_start_time >= p.price_start_time
          AND  (p.price_end_time IS NULL OR u.usage_start_time < p.price_end_time)
        WHERE  u.custom_tags['PipelineId'] = '{pipeline_id}'
          AND  u.usage_date >= CURRENT_DATE - INTERVAL 90 DAYS
        GROUP BY u.sku_name, u.usage_metadata.node_type
    """)

    baseline_rows = []
    if baseline_type == "None":
        pass
    elif baseline_type == "Specific Run ID" and baseline_run_id:
        baseline_rows = safe("baseline_update", f"""
            SELECT update_id, update_type, result_state
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  pipeline_id = '{pipeline_id}' AND update_id = '{baseline_run_id}'
            LIMIT 1
        """)
    elif baseline_type == "Previous Run":
        baseline_rows = safe("baseline_update", f"""
            SELECT update_id, update_type, result_state
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  pipeline_id  = '{pipeline_id}'
              AND  update_id   != '{update_id}'
            ORDER BY update_id DESC
            LIMIT 1
        """)
    else:
        # Last Successful Run (Default)
        baseline_rows = safe("baseline_update", f"""
            SELECT update_id, update_type, result_state
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  pipeline_id  = '{pipeline_id}'
              AND  update_id   != '{update_id}'
              AND  result_state = 'COMPLETED'
            ORDER BY update_id DESC
            LIMIT 1
        """)

    if baseline_rows:
        result["baseline_update"] = baseline_rows[0]

    return result


# ── Discovery queries ─────────────────────────────────────────────────────────

def list_recent_jobs(
    host: str, token: str, warehouse_id: str,
    lookback_days: int = 90, max_jobs: int = 50,
    workspace_id: str | None = None,
) -> list[dict]:
    """Return distinct jobs with their display name and run count."""
    from config.run_intelligence_settings import RIE_ST_JOB_RUN_TIMELINE
    ws_filter_j = f"WHERE j.workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        return _run_sql(f"""
            SELECT j.job_id,
                   COALESCE(j.name, CONCAT('Job ', j.job_id)) AS display_name,
                   MAX(r.period_start_time) AS last_run_at,
                   COUNT(r.run_id) AS total_runs
            FROM   system.lakeflow.jobs j
            LEFT JOIN {RIE_ST_JOB_RUN_TIMELINE} r ON j.job_id = r.job_id
            {ws_filter_j}
            GROUP BY j.job_id, j.name
            ORDER BY last_run_at DESC NULLS LAST, display_name ASC
            LIMIT {max_jobs}
        """, host, token, warehouse_id)
    except Exception as e:
        logger.warning(f"[list_recent_jobs] failed with jobs registry table, trying fallback on timeline only: {e}")
        ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
        return _run_sql(f"""
            SELECT job_id,
                   COALESCE(
                     MAX(CASE WHEN run_name IS NOT NULL AND run_name != '' THEN run_name END),
                     CONCAT('Job ', job_id)
                   ) AS display_name,
                   MAX(period_start_time) AS last_run_at,
                   COUNT(*) AS total_runs
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  1=1
              {ws_filter}
            GROUP BY job_id
            ORDER BY last_run_at DESC
            LIMIT {max_jobs}
        """, host, token, warehouse_id)


def search_recent_jobs(
    search: str, host: str, token: str, warehouse_id: str,
    workspace_id: str | None = None, lookback_days: int = 90, max_jobs: int = 50,
) -> list[dict]:
    """Search distinct jobs case-insensitively by job_id or run_name/name."""
    from config.run_intelligence_settings import RIE_ST_JOB_RUN_TIMELINE
    like = search.replace("'", "''")
    ws_filter_j = f"AND j.workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        return _run_sql(f"""
            SELECT j.job_id,
                   COALESCE(j.name, CONCAT('Job ', j.job_id)) AS display_name,
                   MAX(r.period_start_time) AS last_run_at,
                   COUNT(r.run_id) AS total_runs
            FROM   system.lakeflow.jobs j
            LEFT JOIN {RIE_ST_JOB_RUN_TIMELINE} r ON j.job_id = r.job_id
            WHERE  (LOWER(j.job_id) LIKE LOWER('%{like}%') OR LOWER(j.name) LIKE LOWER('%{like}%'))
              {ws_filter_j}
            GROUP BY j.job_id, j.name
            ORDER BY last_run_at DESC NULLS LAST, display_name ASC
            LIMIT {max_jobs}
        """, host, token, warehouse_id)
    except Exception as e:
        logger.warning(f"[search_recent_jobs] failed with jobs registry table, trying fallback on timeline only: {e}")
        ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
        return _run_sql(f"""
            SELECT job_id,
                   COALESCE(
                     MAX(CASE WHEN run_name IS NOT NULL AND run_name != '' THEN run_name END),
                     CONCAT('Job ', job_id)
                   ) AS display_name,
                   MAX(period_start_time) AS last_run_at,
                   COUNT(*) AS total_runs
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  (LOWER(job_id) LIKE LOWER('%{like}%') OR LOWER(run_name) LIKE LOWER('%{like}%'))
              {ws_filter}
            GROUP BY job_id
            ORDER BY last_run_at DESC
            LIMIT {max_jobs}
        """, host, token, warehouse_id)


def list_recent_runs_for_job(
    job_id: str, host: str, token: str, warehouse_id: str,
    max_runs: int = 30, workspace_id: str | None = None,
) -> list[dict]:
    """Return the N most recent runs of a specific job."""
    from config.run_intelligence_settings import RIE_ST_JOB_RUN_TIMELINE
    ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        return _run_sql(f"""
            SELECT run_id, run_name, result_state,
                   period_start_time, period_end_time,
                   TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
            FROM   {RIE_ST_JOB_RUN_TIMELINE}
            WHERE  job_id = '{job_id}'
              {ws_filter}
            ORDER BY period_start_time DESC
            LIMIT  {max_runs}
        """, host, token, warehouse_id)
    except Exception as e:
        logger.warning(f"[list_recent_runs_for_job] {e}")
        return []


def list_recent_pipelines(
    host: str, token: str, warehouse_id: str,
    lookback_days: int = 90, max_pipelines: int = 20,
    workspace_id: str | None = None,
) -> list[dict]:
    """Return distinct pipelines ordered by latest update_id."""
    from config.run_intelligence_settings import RIE_ST_PIPELINE_UPDATE_TIMELINE
    ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        return _run_sql(f"""
            SELECT pipeline_id,
                   MAX(update_id)    AS last_update_id,
                   COUNT(*)          AS total_updates
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  1=1 {ws_filter}
            GROUP BY pipeline_id
            ORDER BY last_update_id DESC
            LIMIT  {max_pipelines}
        """, host, token, warehouse_id)
    except Exception as e:
        logger.warning(f"[list_recent_pipelines] {e}")
        return []


def search_recent_pipelines(
    search: str, host: str, token: str, warehouse_id: str,
    workspace_id: str | None = None, lookback_days: int = 90, max_pipelines: int = 50,
) -> list[dict]:
    """Search distinct pipelines case-insensitively by pipeline_id or name."""
    from config.run_intelligence_settings import RIE_ST_PIPELINE_UPDATE_TIMELINE
    like = search.replace("'", "''")
    ws_filter = f"AND p.workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        sql = f"""
            SELECT p.pipeline_id,
                   COALESCE(MAX(pl.name), p.pipeline_id) AS display_name,
                   MAX(p.update_id) AS last_update_id,
                   COUNT(*) AS total_updates
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE} p
            LEFT JOIN system.lakeflow.pipelines pl ON p.pipeline_id = pl.pipeline_id
            WHERE  (LOWER(p.pipeline_id) LIKE LOWER('%{like}%') OR LOWER(pl.name) LIKE LOWER('%{like}%'))
              {ws_filter}
            GROUP BY p.pipeline_id
            ORDER BY last_update_id DESC
            LIMIT {max_pipelines}
        """
        return _run_sql(sql, host, token, warehouse_id)
    except Exception as exc:
        logger.warning(f"[search_recent_pipelines] query failed, using fallback: {exc}")
        ws_filter_fallback = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
        sql_fallback = f"""
            SELECT pipeline_id,
                   pipeline_id AS display_name,
                   MAX(update_id) AS last_update_id,
                   COUNT(*) AS total_updates
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  LOWER(pipeline_id) LIKE LOWER('%{like}%')
              {ws_filter_fallback}
            GROUP BY pipeline_id
            ORDER BY last_update_id DESC
            LIMIT {max_pipelines}
        """
        return _run_sql(sql_fallback, host, token, warehouse_id)


def list_recent_updates_for_pipeline(
    pipeline_id: str, host: str, token: str, warehouse_id: str,
    max_updates: int = 30, workspace_id: str | None = None,
) -> list[dict]:
    """
    Return the N most recent updates for a pipeline.
    Uses only confirmed columns: update_id, update_type, result_state, request_id.
    Orders by update_id DESC (no timestamp columns available in this table).
    """
    from config.run_intelligence_settings import RIE_ST_PIPELINE_UPDATE_TIMELINE
    ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
    try:
        return _run_sql(f"""
            SELECT update_id, update_type, result_state, request_id
            FROM   {RIE_ST_PIPELINE_UPDATE_TIMELINE}
            WHERE  pipeline_id = '{pipeline_id}'
              {ws_filter}
            ORDER BY update_id DESC
            LIMIT  {max_updates}
        """, host, token, warehouse_id)
    except Exception as e:
        logger.warning(f"[list_recent_updates_for_pipeline] {e}")
        return []


def describe_system_table_schema(
    table: str, host: str, token: str, warehouse_id: str
) -> list[dict]:
    """
    Run DESCRIBE on a system table and return column names + types.
    Useful for debugging schema mismatches.
    """
    try:
        return _run_sql(f"DESCRIBE {table}", host, token, warehouse_id, timeout_s=20)
    except Exception as e:
        logger.warning(f"[describe_system_table_schema] {table}: {e}")
        return []

