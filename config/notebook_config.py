"""
config/notebook_config.py
Maps FinOps modules (0-19) to specific cell IDs in the
FinOps_Databricks_FullDemo_v5-5 notebook.

Cell IDs are origId values extracted directly from the DBC file.
Each module only points to its HEADING cell (the %md MODULE header).

HOW TO UPDATE
─────────────
1. Open the notebook in Databricks
2. Click on the MODULE heading cell (## MODULE N — ... markdown cell)
3. Look at the browser URL:
   https://YOUR_HOST/#notebook/NOTEBOOK_ID/command/CELL_ID
4. Copy that CELL_ID and update the dict below for that module.
   OR use the Settings page in this app to enter IDs via UI.
"""

MODULE_CELLS = {
    0:  {"name": "Setup",                       "intro": 1561959874304162,  "tags": ["setup","schema","tables"]},
    1:  {"name": "Caching — 3 Layers",          "intro": 1561959874304175,  "tags": ["cache","result cache","disk cache","sql warehouse"]},
    2:  {"name": "Partitioning",                "intro": 1561959874304184,  "tags": ["partition","scan","filter","date filter"]},
    3:  {"name": "VACUUM + OPTIMIZE",           "intro": 7812751700684417,  "tags": ["vacuum","optimize","zombie files","small files","storage"]},
    4:  {"name": "Narrow vs Wide Transforms",   "intro": 1561959874304211,  "tags": ["shuffle","exchange","transform","repartition"]},
    5:  {"name": "Task & Job Observability",    "intro": 1561959874304219,  "tags": ["spark ui","job","stage","task","observability"]},
    6:  {"name": "Z-Order",                     "intro": 1561959874304226,  "tags": ["z-order","file skip","data skipping","high cardinality"]},
    7:  {"name": "AQE",                         "intro": 1561959874304236,  "tags": ["aqe","adaptive","skew","broadcast threshold"]},
    8:  {"name": "Broadcast Join",              "intro": 1561959874304243,  "tags": ["broadcast","join","sort merge join"]},
    9:  {"name": "All 4 Join Types",            "intro": 1561959874304250,  "tags": ["join type","smj","shj","nlj"]},
    10: {"name": "Liquid Clustering",           "intro": 1561959874304260,  "tags": ["liquid clustering","merge","cdc","incremental"]},
    11: {"name": "Data Spill & Skew",           "intro": 1561959874304272,  "tags": ["spill","skew","oom","out of memory","hot key"]},
    12: {"name": "PySpark Optimized Writes",    "intro": 1561959874304280,  "tags": ["write","pyspark","output","write layout"]},
    13: {"name": "Zombie Files",                "intro": 1561959874304289,  "tags": ["zombie","orphan","storage waste","file cleanup"]},
    14: {"name": "Dashboard $18K/Month",        "intro": 1561959874304301,  "tags": ["materialized view","mv","pre-aggregate","repeat query"]},
    15: {"name": "Warehouse Saturation",        "intro": 1561959874304311,  "tags": ["warehouse","queue","saturation","max clusters"]},
    16: {"name": "MERGE INTO Degradation",      "intro": 1561959874304320,  "tags": ["merge","merge into","upsert","pipeline cost"]},
    17: {"name": "Time Travel & Retention",     "intro": 1561959874304327,  "tags": ["time travel","retention","vacuum retain","compliance"]},
    18: {"name": "System Tables Deep-Dive",     "intro": 1561959874304337,  "tags": ["system tables","billing","monitoring","cost attribution"]},
    19: {"name": "Right-Sizing & Cluster Config","intro": 1561959874304364, "tags": ["right-size","cluster config","instance type","tagging"]},
}

DASHBOARD_MODULE_MAP = {
    "usage_overview":        [18, 19, 1, 14, 15],
    "all_purpose_compute":   [5, 4, 7, 8, 11],
    "jobs_compute":          [5, 16, 10, 11, 4],
    "sql_warehouse":         [1, 15, 14, 2, 6],
    "delta_live_tables":     [3, 13, 10, 16, 12],
    "storage_health":        [3, 13, 2, 6, 17],
    "chargeback":            [19, 18, 12, 3, 17],
    "model_serving":         [5, 19, 18],
    "query_intelligence":    [1, 2, 4, 6, 7, 8, 9, 11, 14],
    "merge_health":          [3, 10, 12, 16],
}

ISSUE_ROUTING = {
    "cache_hit_low":       {"modules": [1, 14],      "severity": "high"},
    "queries_queued":      {"modules": [15, 1],      "severity": "high"},
    "warehouse_p90_high":  {"modules": [15, 2, 6],   "severity": "medium"},
    "failed_queries":      {"modules": [5, 15],      "severity": "high"},
    "job_cost_spike":      {"modules": [5, 16, 10],  "severity": "critical"},
    "merge_slow":          {"modules": [10, 16],     "severity": "high"},
    "zombie_files":        {"modules": [13, 3],      "severity": "medium"},
    "vacuum_overdue":      {"modules": [3, 17],      "severity": "medium"},
    "small_files":         {"modules": [3, 2, 12],   "severity": "medium"},
    "untagged_clusters":   {"modules": [19, 18],     "severity": "high"},
    "data_skew":           {"modules": [11, 7],      "severity": "high"},
    "high_gb_scanned":     {"modules": [2, 6, 1],    "severity": "medium"},
    "shuffle_bottleneck":  {"modules": [4, 8, 7],    "severity": "medium"},
    "cost_anomaly":        {"modules": [18, 5],      "severity": "critical"},
    "repeat_queries":      {"modules": [14, 1],      "severity": "medium"},
    "storage_growth":      {"modules": [3, 13, 2],   "severity": "medium"},
    "dlt_backpressure":    {"modules": [3, 10, 16],  "severity": "high"},
    "all_purpose_high":    {"modules": [5, 4, 19],   "severity": "high"},
    # ── New routes for previously dark modules ────────────────────────────
    "data_spill":          {"modules": [11, 7],      "severity": "critical"},
    "cache_breaker":       {"modules": [1, 14],      "severity": "high"},
    "write_amplification": {"modules": [16, 10, 12], "severity": "high"},
    "warehouse_idle":      {"modules": [15, 19],     "severity": "medium"},
    "vacuum_retain0":      {"modules": [17, 3],      "severity": "critical"},
}

# ── Chart → Module map (used by right panel 📡 buttons) ──────────────────────
CHART_MODULE_MAP = {
    # ── Overall ───────────────────────────────────────────────────────────────
    "daily_cost_product":    {"metrics": ["anomaly_count", "total_gb_scanned"],             "default_modules": [18, 19, 14]},
    "spend_by_product":      {"metrics": ["anomaly_count"],                                 "default_modules": [18, 19]},
    "cost_anomaly_detect":   {"metrics": ["anomaly_count"],                                 "default_modules": [18, 5]},
    "sku_wow_heatmap":       {"metrics": ["storage_growth", "anomaly_count"],               "default_modules": [5, 14, 15]},
    # ── Interactive Computes ──────────────────────────────────────────────────
    "classic_daily_cost":    {"metrics": ["wow_pct_change", "untagged_pct"],                "default_modules": [5, 4, 19]},
    "classic_cost_by_team":  {"metrics": ["untagged_pct"],                                  "default_modules": [19, 18]},
    "serverless_ic_daily":   {"metrics": ["wow_pct_change"],                                "default_modules": [5, 4]},
    "session_scan_trend":    {"metrics": ["total_gb_scanned"],                              "default_modules": [2, 6, 1]},
    # ── Jobs ─────────────────────────────────────────────────────────────────
    "classic_jobs_bar":      {"metrics": ["wow_pct_change"],                                "default_modules": [5, 16, 10]},
    "classic_jobs_daily":    {"metrics": ["wow_pct_change"],                                "default_modules": [5, 16]},
    "serverless_jobs_bar":   {"metrics": ["wow_pct_change"],                                "default_modules": [5, 16]},
    "serverless_jobs_daily": {"metrics": ["wow_pct_change"],                                "default_modules": [5]},
    "job_failed_cost":       {"metrics": ["wow_pct_change"],                                "default_modules": [5, 11]},
    "job_8week_trend":       {"metrics": ["cost_trend_pct"],                                "default_modules": [16, 10, 5]},
    # ── SQL Warehouses ────────────────────────────────────────────────────────
    "wh_health_table":       {"metrics": ["cache_hit_pct", "queued_count", "p90_duration_s", "failed_count"], "default_modules": [1, 15, 14]},
    "cache_trend":           {"metrics": ["cache_hit_pct"],                                 "default_modules": [1, 14]},
    "hourly_heatmap":        {"metrics": ["queued_count", "p90_duration_s"],                "default_modules": [15, 2]},
    "top_queries":           {"metrics": ["total_gb_scanned", "p90_duration_s"],            "default_modules": [2, 6]},
    "classic_wh_daily":      {"metrics": ["cache_hit_pct", "queued_count"],                 "default_modules": [1, 15]},
    "serverless_wh_daily":   {"metrics": ["cache_hit_pct"],                                 "default_modules": [1]},
    "idle_billing":          {"metrics": ["idle_billing_pct"],                              "default_modules": [15, 19]},
    # ── Delta Live Tables ─────────────────────────────────────────────────────
    "classic_dlt_daily":     {"metrics": ["wow_pct_change", "dlt_backpressure"],            "default_modules": [3, 10, 16]},
    "classic_dlt_by_tier":   {"metrics": ["wow_pct_change"],                                "default_modules": [3, 16]},
    "serverless_dlt_daily":  {"metrics": ["wow_pct_change"],                                "default_modules": [3, 16]},
    "dlt_run_duration":      {"metrics": ["dlt_backpressure", "failed_count"],              "default_modules": [3, 10, 16]},
    "dlt_run_results":       {"metrics": ["failed_count", "dlt_backpressure"],              "default_modules": [3, 5, 16]},
    # ── Storage ───────────────────────────────────────────────────────────────
    "storage_cost_area":     {"metrics": ["zombie_risk_high_count", "days_since_vacuum"],   "default_modules": [3, 13]},
    "table_sizes_bar":       {"metrics": ["zombie_risk_high_count"],                        "default_modules": [3, 13, 2]},
    "vacuum_compliance":     {"metrics": ["critical_tables", "days_since_vacuum"],          "default_modules": [3, 17]},
    # ── Chargeback ────────────────────────────────────────────────────────────
    "team_spend_bar":        {"metrics": ["untagged_pct", "tag_coverage_pct"],              "default_modules": [19, 18]},
    "tag_coverage_donut":    {"metrics": ["tag_coverage_pct"],                              "default_modules": [19, 18]},
    "quarterly_proj_bar":    {"metrics": ["anomaly_count"],                                 "default_modules": [18, 19]},
    "user_cost_leaderboard": {"metrics": ["total_gb_scanned"],                              "default_modules": [14, 1, 5]},
    # ── Query Intelligence ────────────────────────────────────────────────────
    "spill_events_bar":      {"metrics": ["spill_query_count", "avg_spill_pct"],            "default_modules": [11, 7, 4]},
    "repeat_query_scatter":  {"metrics": ["mv_candidate_count", "cache_breaker_queries"],   "default_modules": [14, 1, 2]},
    "cache_breaker_bar":     {"metrics": ["cache_breaker_queries"],                         "default_modules": [1, 14]},
    "shuffle_ratio_line":    {"metrics": ["avg_shuffle_ratio"],                             "default_modules": [4, 8, 9]},
    # ── MERGE & Clustering ────────────────────────────────────────────────────
    "merge_cost_trend":      {"metrics": ["cost_trend_pct"],                                "default_modules": [16, 10, 5]},
    "lc_candidates_bar":     {"metrics": ["cost_trend_pct"],                                "default_modules": [10, 16]},
    "write_amp_bar":         {"metrics": ["write_amp_pct"],                                 "default_modules": [16, 10, 12]},
    "pyspark_write_audit":   {"metrics": ["small_file_table_count"],                        "default_modules": [12, 3]},
}
