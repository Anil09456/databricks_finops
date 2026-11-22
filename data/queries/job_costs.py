"""
data/queries/job_costs.py
════════════════════════════════════════════════════════════════════════════
Queries for the Jobs & Pipeline Costs dashboard.

System tables used:
  • system.billing.usage  — filtered to JOBS sku_name variants
    Fields: usage_metadata.job_id, usage_metadata.run_id,
            custom_tags (project/team), usage_quantity, sku_name

Performance thresholds (basis for "Analyze Issue"):
  • Single job > $500 / 30 days   → Module 5 (Observability) + Module 16 (MERGE)
  • Job cost WoW increase > 30%   → Module 10 (Liquid Clustering)
  • avg_daily cost spike > 2× avg → Module 11 (Skew), Module 16
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_jobs

rng = np.random.default_rng(42)

def _dates(n, offset=0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── 1. Top 15 jobs by cost (30 days) ─────────────────────────────────────────
TOP_JOBS_SQL = """
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  ROUND(AVG(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS avg_run_usd,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)              AS total_runs
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
GROUP BY 1, 2
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

def get_top_jobs(workspace_id: str | None = None) -> pd.DataFrame:
    sql = TOP_JOBS_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── 2. Daily job cost by SKU category ────────────────────────────────────────
JOB_DAILY_SQL = """
SELECT
  u.usage_date,
  CASE WHEN u.sku_name LIKE '%SERVERLESS%' THEN 'Serverless Jobs'
       WHEN u.sku_name LIKE '%JOBS%'       THEN 'Classic Jobs'
       ELSE 'All-Purpose' END             AS job_type,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2
"""

def get_job_daily_cost(workspace_id: str | None = None) -> pd.DataFrame:
    sql = JOB_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── 3. Job cost WoW change (spot anomalies) ───────────────────────────────────
JOB_WOW_SQL = """
WITH this_week AS (
  SELECT u.usage_metadata.job_id AS job_id,
         ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_this_week
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
    AND u.usage_metadata.job_id IS NOT NULL
  GROUP BY 1
),
prev_week AS (
  SELECT u.usage_metadata.job_id AS job_id,
         ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_prev_week
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
    AND u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
    AND u.usage_metadata.job_id IS NOT NULL
  GROUP BY 1
)
SELECT t.job_id,
       t.cost_this_week,
       COALESCE(p.cost_prev_week, 0) AS cost_prev_week,
       ROUND((t.cost_this_week - COALESCE(p.cost_prev_week, 0))
             / NULLIF(COALESCE(p.cost_prev_week, 0), 0) * 100, 1) AS wow_pct_change
FROM this_week t
LEFT JOIN prev_week p USING (job_id)
ORDER BY t.cost_this_week DESC
LIMIT 10
"""

def get_job_wow_change(workspace_id: str | None = None) -> pd.DataFrame:
    sql = JOB_WOW_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── 4. Classic Job Compute KPI (sku_name NOT LIKE '%SERVERLESS%') ─────────────
JOB_CLASSIC_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.job_id)                                  AS job_count,
  COUNT(DISTINCT u.usage_date)                                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
"""

JOB_CLASSIC_TOP_SQL = """
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)              AS total_runs
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY u.usage_metadata.job_id
ORDER BY cost_30d_usd DESC
LIMIT 10
"""

JOB_CLASSIC_DAILY_SQL = """
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
"""

def get_job_classic_kpi(workspace_id: str | None = None):
    sql = JOB_CLASSIC_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

def get_job_classic_top(workspace_id: str | None = None):
    sql = JOB_CLASSIC_TOP_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

def get_job_classic_daily(workspace_id: str | None = None):
    sql = JOB_CLASSIC_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── 5. Serverless Job Compute KPI (sku_name LIKE '%SERVERLESS%JOBS%') ─────────
JOB_SERVERLESS_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.job_id)                                  AS job_count,
  COUNT(DISTINCT u.usage_date)                                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
"""

JOB_SERVERLESS_TOP_SQL = """
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)              AS total_runs
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY u.usage_metadata.job_id
ORDER BY cost_30d_usd DESC
LIMIT 10
"""

JOB_SERVERLESS_DAILY_SQL = """
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
"""

def get_job_serverless_kpi(workspace_id: str | None = None):
    sql = JOB_SERVERLESS_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

def get_job_serverless_top(workspace_id: str | None = None):
    sql = JOB_SERVERLESS_TOP_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

def get_job_serverless_daily(workspace_id: str | None = None):
    sql = JOB_SERVERLESS_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── New: Failed run wasted cost ───────────────────────────────────────────────
JOB_FAILED_COST_SQL = """
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS failed_cost_usd,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS wasted_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
INNER JOIN system.lakeflow.job_run_timeline r
  ON u.usage_metadata.job_id = r.job_id
  AND u.usage_metadata.job_run_id = r.run_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND r.result_state = 'FAILED'
GROUP BY 1
ORDER BY 1
"""

def get_job_failed_cost(workspace_id: str | None = None):
    sql = JOB_FAILED_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)

# ── New: 8-week job cost trend (for MERGE degradation detection) ──────────────
JOB_WEEKLY_TREND_SQL = """
SELECT
  DATE_TRUNC('week', u.usage_date)                    AS week_start,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)  AS weekly_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 56 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
GROUP BY 1
ORDER BY 1 ASC
"""

def get_job_weekly_trend(workspace_id: str | None = None):
    sql = JOB_WEEKLY_TREND_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_jobs(sql)
