"""
api/routers/analyze.py
═══════════════════════════════════════════════════════════════════════════════
Issue analysis endpoint — ports analyze_panel.py logic to a pure REST API.
POST /api/analyze  { dashboard_id, metrics }
Returns: { issues: [...], explore_modules: [...] }
"""
from fastapi import APIRouter
from pydantic import BaseModel
from config.notebook_config import MODULE_CELLS, DASHBOARD_MODULE_MAP, ISSUE_ROUTING, CHART_MODULE_MAP
from config.settings import notebook_cell_url, notebook_base_url

router = APIRouter()

_DETECTORS = {
    "cache_hit_pct":          {"key": "cache_hit_low",       "threshold": 60,  "direction": "below"},
    "queued_count":           {"key": "queries_queued",      "threshold": 5,   "direction": "above"},
    "p90_duration_s":         {"key": "warehouse_p90_high",  "threshold": 120, "direction": "above"},
    "failed_count":           {"key": "failed_queries",      "threshold": 5,   "direction": "above"},
    "wow_pct_change":         {"key": "job_cost_spike",      "threshold": 50,  "direction": "above"},
    "untagged_pct":           {"key": "untagged_clusters",   "threshold": 10,  "direction": "above"},
    "zombie_risk_high_count": {"key": "zombie_files",        "threshold": 1,   "direction": "above"},
    "days_since_vacuum":      {"key": "vacuum_overdue",      "threshold": 30,  "direction": "above"},
    "anomaly_count":          {"key": "cost_anomaly",        "threshold": 0,   "direction": "above"},
    "tag_coverage_pct":       {"key": "untagged_clusters",   "threshold": 80,  "direction": "below"},
    "total_gb_scanned":       {"key": "high_gb_scanned",     "threshold": 500, "direction": "above"},
    "spill_query_count":      {"key": "data_spill",          "threshold": 0,   "direction": "above"},
    "avg_spill_pct":          {"key": "data_spill",          "threshold": 20,  "direction": "above"},
    "cache_breaker_queries":  {"key": "cache_breaker",       "threshold": 20,  "direction": "above"},
    "mv_candidate_count":     {"key": "repeat_queries",      "threshold": 0,   "direction": "above"},
    "idle_billing_pct":       {"key": "warehouse_idle",      "threshold": 30,  "direction": "above"},
    "cost_trend_pct":         {"key": "merge_slow",          "threshold": 15,  "direction": "above"},
    "write_amp_pct":          {"key": "write_amplification", "threshold": 100, "direction": "above"},
    "small_file_table_count": {"key": "small_files",         "threshold": 0,   "direction": "above"},
    "retain0_violation_count":{"key": "vacuum_retain0",      "threshold": 0,   "direction": "above"},
    "all_purpose_high":       {"key": "all_purpose_high",    "threshold": 100, "direction": "above"},
    "storage_growth":          {"key": "storage_growth",      "threshold": 0,   "direction": "above"},
    "dlt_backpressure":        {"key": "dlt_backpressure",    "threshold": 0,   "direction": "above"},
    "critical_tables":         {"key": "vacuum_overdue",      "threshold": 0,   "direction": "above"},
    "avg_shuffle_ratio":       {"key": "shuffle_bottleneck",  "threshold": 30,  "direction": "above"},
}

_LABELS = {
    "cache_hit_pct":          lambda v: f"Cache hit rate is {v:.1f}% — target is 60%+",
    "queued_count":           lambda v: f"{int(v)} queries queued — warehouse saturation detected",
    "p90_duration_s":         lambda v: f"P90 query time is {v:.0f}s — above 120s threshold",
    "failed_count":           lambda v: f"{int(v)} failed queries detected this week",
    "wow_pct_change":         lambda v: f"Job cost increased {v:.0f}% week-over-week",
    "untagged_pct":           lambda v: f"{v:.0f}% of spend is unattributed (no cluster tags)",
    "zombie_risk_high_count": lambda v: f"{int(v)} table(s) at HIGH zombie-file risk",
    "days_since_vacuum":      lambda v: f"Tables not optimized in {int(v)}+ days",
    "anomaly_count":          lambda v: f"{int(v)} cost anomaly/ies detected in last 14 days",
    "tag_coverage_pct":       lambda v: f"Cluster tagging coverage is {v:.0f}% — target is 80%+",
    "total_gb_scanned":       lambda v: f"{v:.0f} GB scanned — check for missing partitions/Z-Order",
    "spill_query_count":      lambda v: f"{int(v)} queries spilled to disk this week",
    "avg_spill_pct":          lambda v: f"Avg spill is {v:.0f}% of bytes read",
    "cache_breaker_queries":  lambda v: f"{int(v)} queries use CURRENT_DATE/RAND — defeating result cache",
    "mv_candidate_count":     lambda v: f"{int(v)} query pattern(s) running >50×/day — strong MV candidates",
    "idle_billing_pct":       lambda v: f"Warehouses idle {v:.0f}% of billed time",
    "cost_trend_pct":         lambda v: f"Job cost growing {v:.0f}% week-over-week",
    "write_amp_pct":          lambda v: f"Write amplification {v:.0f}%",
    "small_file_table_count": lambda v: f"{int(v)} table(s) with >1000 output files",
    "retain0_violation_count":lambda v: f"{int(v)} table(s) have VACUUM RETAIN 0 history",
    "all_purpose_high":       lambda v: f"All-purpose compute cost ${v:,.0f} — review cluster usage",
    "storage_growth":          lambda v: f"Product SKU cost growth detected — {int(v)} SKU(s) spiked >20% WoW",
    "dlt_backpressure":        lambda v: f"DLT pipeline backpressure detected — {int(v)} pipeline(s) degrading",
    "critical_tables":         lambda v: f"{int(v)} table(s) overdue for VACUUM",
    "avg_shuffle_ratio":       lambda v: f"Average shuffle ratio is {v:.1f}% — high shuffle bottleneck",
}

_TIPS = {
    "cache_hit_pct":          "Low cache hit = paying for the same data multiple times.",
    "queued_count":           "Queued queries = users waiting & productivity lost.",
    "p90_duration_s":         "Slow P90 indicates missing optimisations or warehouse undersizing.",
    "failed_count":           "Failures waste full cluster cost — diagnose with Module 5.",
    "wow_pct_change":         "Sudden cost increase usually means MERGE degradation or data skew.",
    "untagged_pct":           "Untagged spend cannot be charged back to teams.",
    "zombie_risk_high_count": "Zombie files inflate storage costs — run VACUUM to recover space.",
    "days_since_vacuum":      "Tables without OPTIMIZE accumulate small files — query slowdowns ahead.",
    "anomaly_count":          "Investigate anomalies before costs compound.",
    "tag_coverage_pct":       "Incomplete tags break chargeback reports.",
    "total_gb_scanned":       "High scans = paying for data you don't need to read.",
    "spill_query_count":      "Disk spill converts RAM-speed work into slow disk I/O.",
    "avg_spill_pct":          "Spill ratio >20% means memory is the bottleneck.",
    "cache_breaker_queries":  "Pass dates as literals from your BI tool to restore cache hits.",
    "mv_candidate_count":     "A Materialized View eliminates the repeated full scan cost.",
    "idle_billing_pct":       "Set auto-stop to 5–10 min for interactive warehouses.",
    "cost_trend_pct":         "Linear cost growth without data volume growth = MERGE full table scans.",
    "write_amp_pct":          "High cost variance per run = full-table rewrites.",
    "small_file_table_count": "Use repartitionByRange() before write, or OPTIMIZE after.",
    "retain0_violation_count":"VACUUM RETAIN 0 is irreversible — destroys time travel.",
    "all_purpose_high":       "Review cluster auto-termination and idle cluster policies.",
    "storage_growth":          "Investigate SKU cost trends; run OPTIMIZE/VACUUM (Module 3) to reduce storage growth.",
    "dlt_backpressure":        "Review pipeline execution durations and apply Liquid Clustering (Module 10) or optimization configs.",
    "critical_tables":         "Run VACUUM to remove obsolete historical files and reclaim storage space (Module 3).",
    "avg_shuffle_ratio":       "High shuffle ratio suggests wide transformations. Optimize joins (Module 8/9) or use partition pruning (Module 2).",
}


class AnalyzeRequest(BaseModel):
    dashboard_id: str
    metrics: dict


def _detect_issues(metrics: dict) -> list[dict]:
    issues = []
    for metric_key, detector in _DETECTORS.items():
        val = metrics.get(metric_key)
        if val is None:
            continue
        try:
            val = float(val)
        except (TypeError, ValueError):
            continue
        triggered = (
            (detector["direction"] == "above" and val > detector["threshold"]) or
            (detector["direction"] == "below" and val < detector["threshold"])
        )
        if triggered:
            routing = ISSUE_ROUTING.get(detector["key"], {"modules": [], "severity": "medium"})
            label_fn = _LABELS.get(metric_key, lambda v: f"{metric_key} = {v}")
            tip      = _TIPS.get(metric_key, "")
            modules  = routing["modules"]
            issues.append({
                "key":      detector["key"],
                "label":    label_fn(val),
                "tip":      tip,
                "severity": routing["severity"],
                "modules":  [
                    {
                        "number": m,
                        "name":   MODULE_CELLS.get(m, {}).get("name", f"Module {m}"),
                        "url":    notebook_cell_url(MODULE_CELLS[m]["intro"])
                                  if m in MODULE_CELLS and "intro" in MODULE_CELLS[m]
                                  else notebook_base_url(),
                    }
                    for m in modules
                ],
            })
    return issues


@router.post("")
def analyze(req: AnalyzeRequest):
    # Filter incoming metrics by the active chart's config in CHART_MODULE_MAP
    filtered_metrics = req.metrics
    chart_config = CHART_MODULE_MAP.get(req.dashboard_id)
    if chart_config and "metrics" in chart_config:
        allowed_keys = chart_config["metrics"]
        filtered_metrics = {k: v for k, v in req.metrics.items() if k in allowed_keys}

    issues = _detect_issues(filtered_metrics)
    all_module_nums = {m["number"] for issue in issues for m in issue["modules"]}
    default_modules = CHART_MODULE_MAP.get(req.dashboard_id, {}).get("default_modules", [])
    if not default_modules:
        default_modules = DASHBOARD_MODULE_MAP.get(req.dashboard_id, [])
    explore = list(dict.fromkeys(
        list(all_module_nums) + [m for m in default_modules if m not in all_module_nums]
    ))
    explore_modules = [
        {
            "number": m,
            "name":   MODULE_CELLS.get(m, {}).get("name", f"Module {m}"),
            "url":    notebook_cell_url(MODULE_CELLS[m]["intro"])
                      if m in MODULE_CELLS and "intro" in MODULE_CELLS[m]
                      else notebook_base_url(),
        }
        for m in explore
    ]
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues.sort(key=lambda x: sev_order.get(x["severity"], 9))
    return {"issues": issues, "explore_modules": explore_modules}
