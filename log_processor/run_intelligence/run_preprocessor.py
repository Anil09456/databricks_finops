"""
log_processor/run_intelligence/run_preprocessor.py
══════════════════════════════════════════════════════════════════════════════
Unified preprocessor — merges outputs from all three data sources into a
single RunIntelligenceSummary dict consumed by the AI engine and the UI.

Data sources merged:
  • system_data   — from system_table_fetcher
  • event_data    — from event_log_fetcher (cluster events + DLT event log)
  • log_data      — from log_file_resolver (DriverLogPreprocessor output)

Output schema (RunIntelligenceSummary):
  {
    "schema_version":  "2.0",
    "entity":          { job_id/pipeline_id, run_id/update_id, name, type, status },
    "timing":          { start, end, duration_mins, vs_baseline_pct },
    "cost":            { dbus, cost_usd, sku_breakdown },
    "infrastructure":  { driver_type, worker_type, workers, photon, dbr_version },
    "data_metrics":    { rows_in, rows_out, bytes_spilled, retries, datasets },
    "data_quality":    { expectations, pass_rate, failed_records, dq_score },
    "signals":         [ { severity, source, category, message, count } ],
    "scaling_events":  [ { type, time, nodes_before, nodes_after } ],
    "health":          { score, flags },
    "data_sources":    { system_tables, event_logs, log_files },
    "raw":             { system_data, event_data, log_data }  ← kept for AI prompt
  }
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "2.0"


def build_run_summary(
    entity_type: str,           # "job" | "pipeline"
    entity_id: str,
    run_id: str,
    entity_name: str = "",
    system_data: dict | None = None,
    event_data: dict | None = None,
    log_data: dict | None = None,
) -> dict[str, Any]:
    """
    Merge all three data source outputs into a unified RunIntelligenceSummary.

    Args:
        entity_type:  "job" or "pipeline"
        entity_id:    Job ID or Pipeline ID
        run_id:       Run ID or Update ID
        entity_name:  Human-readable name (Job Name or Pipeline name)
        system_data:  Output of fetch_job_system_tables() or fetch_pipeline_system_tables()
        event_data:   Dict with keys: cluster_events, dlt_events, job_run_output
        log_data:     Output of fetch_and_parse_log_files() (DriverLogPreprocessor format)

    Returns:
        RunIntelligenceSummary dict
    """
    system_data = system_data or {}
    event_data  = event_data  or {}
    log_data    = log_data    or {}

    summary: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "generated_at":   datetime.now(timezone.utc).isoformat(),
        "entity":         {},
        "timing":         {},
        "cost":           {},
        "infrastructure": {},
        "data_metrics":   {},
        "data_quality":   {},
        "signals":        [],
        "scaling_events": [],
        "health":         {"score": 100, "flags": {}},
        "data_sources":   {
            "system_tables": bool(system_data),
            "event_logs":    bool(event_data.get("cluster_events") or event_data.get("dlt_events")),
            "log_files":     log_data.get("_available", False),
        },
        "raw": {
            "system_data": system_data,
            "event_data":  event_data,
            "log_data":    log_data,
        },
        # Surface any query errors so the UI can show them
        "_fetch_errors": system_data.get("_errors", []),
    }

    # ── Entity block ──────────────────────────────────────────────────────────
    if entity_type == "job":
        run_sum = system_data.get("run_summary", {})
        summary["entity"] = {
            "type":       "job",
            "job_id":     entity_id,
            "run_id":     run_id,
            "name":       entity_name or run_sum.get("job_name", "Unknown Job"),
            "status":     run_sum.get("result_state", "UNKNOWN"),
            "state_msg":  run_sum.get("state_message", ""),
            "run_type":   run_sum.get("run_type", ""),
        }
    else:  # pipeline
        upd_sum = system_data.get("update_summary", {})
        summary["entity"] = {
            "type":        "pipeline",
            "pipeline_id": entity_id,
            "update_id":   run_id,
            "name":        entity_name or f"Pipeline {entity_id[:8]}",
            "status":      upd_sum.get("state", "UNKNOWN"),
            "cause":       upd_sum.get("cause", ""),
            "update_type": upd_sum.get("update_type", ""),
        }

    # ── Timing block ──────────────────────────────────────────────────────────
    if entity_type == "job":
        rs = system_data.get("run_summary", {})
        dur_s = _safe_int(rs.get("duration_seconds"))
        baseline = system_data.get("baseline_run", {})
        base_dur_s = _safe_int(baseline.get("duration_seconds"))
    else:
        us = system_data.get("update_summary", {})
        dur_s = _safe_int(us.get("duration_seconds"))
        baseline = system_data.get("baseline_update", {})
        base_dur_s = _safe_int(baseline.get("duration_seconds"))

    vs_baseline_pct = None
    if dur_s and base_dur_s and base_dur_s > 0:
        vs_baseline_pct = round((dur_s - base_dur_s) / base_dur_s * 100, 1)

    summary["timing"] = {
        "duration_seconds":  dur_s,
        "duration_mins":     round(dur_s / 60, 1) if dur_s else None,
        "vs_baseline_pct":   vs_baseline_pct,
        "baseline_duration_seconds": base_dur_s,
    }

    # ── Cost block ────────────────────────────────────────────────────────────
    cost_rows = system_data.get("cost_breakdown", [])
    total_dbus    = sum(_safe_float(r.get("total_dbus"))  for r in cost_rows)
    total_cost    = sum(_safe_float(r.get("cost_usd"))    for r in cost_rows)
    summary["cost"] = {
        "total_dbus":    round(total_dbus, 4),
        "total_cost_usd": round(total_cost, 4),
        "sku_breakdown": cost_rows,
    }

    # ── Infrastructure block ──────────────────────────────────────────────────
    cc = system_data.get("cluster_config", {})
    # Fallback heuristic: check if any SKU in the billing records contains the word "SERVERLESS"
    has_serverless_sku = any("SERVERLESS" in str(r.get("sku_name", "")).upper() for r in cost_rows)
    
    # Detect if we have any classic cluster config signature (cluster ID or node type spec)
    has_classic_info = bool(cc.get("cluster_id") or cc.get("driver_node_type_id") or cc.get("node_type_id"))

    is_serverless = None
    if cc.get("is_serverless") is True or has_serverless_sku:
        is_serverless = True
    elif cc.get("is_serverless") is False or has_classic_info:
        is_serverless = False

    photon = None
    if is_serverless is True:
        photon = True
    elif is_serverless is False:
        photon = str(cc.get("runtime_engine", "")).upper() == "PHOTON"

    if is_serverless is True:
        summary["infrastructure"] = {
            "is_serverless":      True,
            "compute_kind":       cc.get("compute_kind", "SERVERLESS") if not has_serverless_sku else "SERVERLESS",
            "driver_node_type":   "Serverless",
            "worker_node_type":   "Serverless",
            "num_workers":        None,
            "autoscale":          None,
            "photon_enabled":     True,   # Serverless always uses Photon engine
            "dbr_version":        "Serverless",
            "data_security_mode": cc.get("data_security_mode", "") or "N/A",
        }
    elif is_serverless is False:
        summary["infrastructure"] = {
            "is_serverless":      False,
            "compute_kind":       cc.get("compute_kind", "CLASSIC"),
            "driver_node_type":   cc.get("driver_node_type_id") or "N/A",
            "worker_node_type":   cc.get("node_type_id")        or "N/A",
            "num_workers":        _safe_int(cc.get("num_workers")) if cc.get("num_workers") is not None else None,
            "autoscale":          cc.get("autoscale"),
            "photon_enabled":     photon,
            "dbr_version":        cc.get("spark_version") or "N/A",
            "data_security_mode": cc.get("data_security_mode", "") or "N/A",
        }
    else:  # is_serverless is None (No data available)
        summary["infrastructure"] = {
            "is_serverless":      None,
            "compute_kind":       "N/A",
            "driver_node_type":   "N/A",
            "worker_node_type":   "N/A",
            "num_workers":        None,
            "autoscale":          None,
            "photon_enabled":     None,
            "dbr_version":        "N/A",
            "data_security_mode": "N/A",
        }

    # ── Data metrics block ────────────────────────────────────────────────────
    if entity_type == "job":
        tasks = system_data.get("task_breakdown", [])
        retries = sum(max(0, _safe_int(t.get("attempt_number", 1)) - 1) for t in tasks)
        summary["data_metrics"] = {
            "retries":       retries,
            "task_count":    len(tasks),
            "failed_tasks":  sum(1 for t in tasks if t.get("result_state") not in ("SUCCEEDED",)),
            "rows_in":       None,
            "rows_out":      None,
            "bytes_spilled": _extract_spill_from_log(log_data),
        }
    else:
        datasets = system_data.get("dataset_metrics", [])
        flows    = system_data.get("flow_metrics", [])
        total_rows_out = sum(_safe_int(d.get("num_output_rows")) for d in datasets)
        total_backlog  = sum(_safe_int(d.get("backlog_bytes"))   for d in datasets)
        summary["data_metrics"] = {
            "datasets":      datasets,
            "flows":         flows,
            "total_rows_out": total_rows_out,
            "total_backlog_bytes": total_backlog,
            "rows_in":       None,
            "rows_out":      total_rows_out,
            "bytes_spilled": _extract_spill_from_log(log_data),
        }

    # ── Data quality block ────────────────────────────────────────────────────
    expectations = system_data.get("expectations", [])
    if expectations:
        total_passed = sum(_safe_int(e.get("passed_records")) for e in expectations)
        total_failed = sum(_safe_int(e.get("failed_records")) for e in expectations)
        total_records = total_passed + total_failed
        pass_rate = round(total_passed / total_records * 100, 1) if total_records > 0 else None
        dq_score  = pass_rate
    else:
        total_failed, pass_rate, dq_score = 0, None, None

    summary["data_quality"] = {
        "expectations":  expectations,
        "pass_rate":     pass_rate,
        "dq_score":      dq_score,
        "failed_records": total_failed,
        "has_failures":  total_failed > 0,
    }

    # ── Signals: merge from log files + event logs ────────────────────────────
    signals = []

    # From log file preprocessor
    for issue in log_data.get("top_issues", []):
        signals.append({
            "severity": issue.get("severity", "MEDIUM"),
            "source":   issue.get("source", "log_files"),
            "category": issue.get("category", "unknown"),
            "message":  issue.get("message", ""),
            "count":    issue.get("occurrences", 1),
            "sample":   issue.get("sample", ""),
        })

    # From cluster events (critical infrastructure events)
    cluster_events = event_data.get("cluster_events", [])
    for ev in cluster_events:
        ev_type = ev.get("type", "")
        if ev_type in ("NODES_LOST", "DRIVER_UNAVAILABLE", "SPARK_EXCEPTION"):
            signals.append({
                "severity": "HIGH",
                "source":   "cluster_events",
                "category": ev_type.lower(),
                "message":  ev.get("details", {}).get("reason", ev_type),
                "count":    1,
                "sample":   "",
            })

    # From DLT error events
    dlt_events_data = event_data.get("dlt_events", {})
    for err in dlt_events_data.get("errors", []):
        signals.append({
            "severity": "HIGH" if err.get("level") == "ERROR" else "MEDIUM",
            "source":   "dlt_event_log",
            "category": err.get("event_type", "dlt_error"),
            "message":  err.get("message", ""),
            "count":    1,
            "sample":   "",
        })

    summary["signals"] = _deduplicate_signals(signals)

    # ── Scaling events ────────────────────────────────────────────────────────
    scaling_types = {"RESIZING", "UPSIZE_COMPLETED", "DOWNSIZE_COMPLETED", "AUTOSCALING_STATS_REPORT"}
    summary["scaling_events"] = [
        {
            "type":      ev.get("type", ""),
            "timestamp": ev.get("timestamp", ""),
            "details":   ev.get("details", {}),
        }
        for ev in cluster_events
        if ev.get("type", "") in scaling_types
    ]

    # ── Health score ──────────────────────────────────────────────────────────
    summary["health"] = _compute_health(summary)

    return summary


# ── Health score ──────────────────────────────────────────────────────────────

def _compute_health(summary: dict) -> dict:
    from config.run_intelligence_settings import RIE_HEALTH_SCORE_WEIGHTS

    penalty = 0
    flags: dict[str, bool] = {}

    for sig in summary.get("signals", []):
        sev = sig.get("severity", "INFO")
        penalty += RIE_HEALTH_SCORE_WEIGHTS.get(sev, 0) * min(sig.get("count", 1), 5)

    cats = {s.get("category", "") for s in summary.get("signals", [])}

    flags["oom"]           = bool(cats & {"oom_heap","oom_gc_overhead","oom_container","oom_direct_buffer"})
    flags["spill"]         = bool(cats & {"spill_to_disk","cache_spill"})
    flags["executor_loss"] = bool(cats & {"executor_lost","nodes_lost"})
    flags["task_failures"] = bool(cats & {"task_lost","stage_failed","job_failed"})
    flags["dq_failures"]   = summary["data_quality"].get("has_failures", False)
    flags["retries"]       = (summary["data_metrics"].get("retries", 0) or 0) > 0
    flags["photon_off"]    = not summary["infrastructure"].get("photon_enabled", True)

    score = max(0, min(100, 100 - penalty))

    # Also penalise for DQ failures
    if flags["dq_failures"] and summary["data_quality"].get("pass_rate") is not None:
        dq_pass = summary["data_quality"]["pass_rate"] or 100
        score = max(0, score - int((100 - dq_pass) * 0.3))

    return {"score": score, "flags": flags}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_int(val: Any, default: int = 0) -> int:
    try:
        return int(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _extract_spill_from_log(log_data: dict) -> int | None:
    """Extract total spill bytes from log file signals, if present."""
    for issue in log_data.get("top_issues", []):
        if issue.get("category") == "spill_to_disk":
            return issue.get("occurrences", 1)
    return None


def _deduplicate_signals(signals: list[dict]) -> list[dict]:
    """Deduplicate by (source, category), accumulating count."""
    seen: dict[str, dict] = {}
    for s in signals:
        key = f"{s.get('source')}:{s.get('category')}"
        if key not in seen:
            seen[key] = dict(s)
        else:
            seen[key]["count"] = seen[key].get("count", 1) + s.get("count", 1)
    # Sort: CRITICAL → HIGH → MEDIUM → LOW → INFO
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    return sorted(seen.values(), key=lambda x: order.get(x.get("severity", "INFO"), 4))
