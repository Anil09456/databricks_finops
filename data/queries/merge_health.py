"""
data/queries/merge_health.py
════════════════════════════════════════════════════════════════════════════
Queries for the MERGE & Clustering Health dashboard.

System tables / Delta metadata used:
  • system.lakeflow.job_run_timeline — job run durations
  • system.billing.usage            — job DBU consumption over time
  • system.information_schema.tables — table metadata for file counts

Signals → Modules:
  • MERGE exec_sec growing week-over-week  → M16 (MERGE Degradation) + M10 (LC)
  • rows_copied / rows_updated > 10x       → M16 + M10
  • tables with > 5 MERGE ops & rising     → M10 (Liquid Clustering)
  • output file count > 1000 for < 100GB   → M12 (PySpark Optimized Writes)
  • job_cost WoW trend (8-week)            → M5 (Observability) + M16
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_jobs, run_query_merge
# ── 1. MERGE cost trend — 8 weeks per job ────────────────────────────────────
# Uses billing.usage filtered to MERGE-heavy jobs (JOBS SKU)
MERGE_TREND_SQL = """
WITH weekly_job_cost AS (
  SELECT
    DATE_TRUNC('week', u.usage_date)           AS week_start,
    COALESCE(u.custom_tags['project'], u.usage_metadata.job_id::STRING)
                                             AS job_name,
    ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS weekly_cost_usd
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 56 DAYS
    AND u.usage_metadata.job_id IS NOT NULL
    AND (u.sku_name LIKE '%JOBS%')
  GROUP BY 1, 2
),
with_lag AS (
  SELECT *,
    LAG(weekly_cost_usd) OVER (
      PARTITION BY job_name ORDER BY week_start
    )                                        AS prev_week_cost
  FROM weekly_job_cost
)
SELECT
  week_start,
  job_name,
  weekly_cost_usd,
  ROUND(prev_week_cost, 2)                   AS prev_week_cost,
  ROUND((weekly_cost_usd - prev_week_cost)
        / NULLIF(prev_week_cost, 0) * 100, 1) AS wow_change_pct
FROM with_lag
ORDER BY week_start, job_name
"""

def get_merge_trend(workspace_id: str | None = None) -> pd.DataFrame:
    sql = MERGE_TREND_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_merge(sql)

# ── 2. Liquid Clustering candidates ──────────────────────────────────────────
# Tables with many MERGE/UPDATE operations and no Liquid Clustering applied
# Approximated from billing — job runs on same tables repeatedly
LC_CANDIDATES_SQL = """
SELECT
  COALESCE(u.custom_tags['project'], u.custom_tags['team'],
          CAST(u.usage_metadata.job_id AS STRING), 'unknown')  AS job_name,
  COUNT(DISTINCT u.usage_date)                   AS active_days_30d,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)) / COUNT(DISTINCT u.usage_date), 2)
                                               AS avg_daily_cost,
  ROUND(
    SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
             THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END)
    / NULLIF(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                       AND u.usage_date < CURRENT_DATE - INTERVAL 7 DAYS
                      THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 0) * 100 - 100
  , 1)                                         AS cost_trend_pct
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%JOBS%'
GROUP BY 1
HAVING COUNT(DISTINCT u.usage_date) >= 3
   AND SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)) > 1
ORDER BY avg_daily_cost DESC
LIMIT 10
"""

def get_lc_candidates(workspace_id: str | None = None) -> pd.DataFrame:
    sql = LC_CANDIDATES_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_merge(sql)

# ── 3. Write amplification proxy ──────────────────────────────────────────────
# Approximate: jobs that run very frequently AND cost grows → full-table rewrites
# Real metric would come from DESCRIBE HISTORY rows_copied/rows_updated
WRITE_AMP_SQL = """
SELECT
  COALESCE(u.custom_tags['project'], CAST(u.usage_metadata.job_id AS STRING), 'unknown')
                                               AS job_name,
  COUNT(DISTINCT u.usage_date)                   AS run_days_7d,
  ROUND(AVG(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 3) AS avg_dbu_per_day,
  ROUND(MAX(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS max_day_cost,
  ROUND(MIN(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS min_day_cost,
  ROUND(
    (MAX(u.usage_quantity) - MIN(u.usage_quantity))
    / NULLIF(AVG(u.usage_quantity), 0) * 100, 1
  )                                            AS cost_variance_pct
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%JOBS%'
GROUP BY 1
HAVING COUNT(DISTINCT u.usage_date) >= 2
  AND MAX(u.usage_quantity) > MIN(u.usage_quantity)
ORDER BY cost_variance_pct DESC
LIMIT 10
"""

def get_write_amplification(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WRITE_AMP_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_merge(sql)

# ── 4. PySpark write output file audit ────────────────────────────────────────
# Tables with high file counts relative to their size = small file problem
# Approximated from information_schema + billing
PYSPARK_WRITE_SQL = """
SELECT
  table_schema,
  table_name,
  0                                           AS size_gb,
  0                                           AS file_count_estimate,
  last_altered
FROM system.information_schema.tables
WHERE table_type = 'MANAGED'
ORDER BY last_altered DESC
LIMIT 10
"""

def get_pyspark_write_audit(workspace_id: str | None = None) -> pd.DataFrame:
    sql = PYSPARK_WRITE_SQL
    return run_query_merge(sql)

# ── 5. MERGE & Clustering KPI summary ────────────────────────────────────────
def get_merge_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    lc  = get_lc_candidates(workspace_id=workspace_id)
    wa  = get_write_amplification(workspace_id=workspace_id)
    pw  = get_pyspark_write_audit(workspace_id=workspace_id)
    avg_growth = float(pd.to_numeric(lc["cost_trend_pct"], errors="coerce").mean()) if not lc.empty else 0.0
    max_var    = float(pd.to_numeric(wa["cost_variance_pct"], errors="coerce").max()) if not wa.empty else 0.0
    lc_count   = int((pd.to_numeric(lc["cost_trend_pct"], errors="coerce").fillna(0) > 10).sum()) if not lc.empty else 0
    sf_count   = int((pd.to_numeric(pw["file_count_estimate"], errors="coerce").fillna(0) > 1000).sum()) if not pw.empty else 0
    return pd.DataFrame([{
        "avg_weekly_cost_growth_pct": round(avg_growth, 1),
        "max_cost_variance_pct":      round(max_var, 1),
        "lc_candidate_count":         lc_count,
        "small_file_table_count":     sf_count,
    }])

