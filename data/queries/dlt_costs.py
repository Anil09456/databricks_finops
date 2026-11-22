"""
data/queries/dlt_costs.py
Queries for Delta Live Tables dashboard — split into Classic and Serverless.

Databricks billing_origin_product for DLT: 'DELTA_LIVE_TABLES'
  Classic DLT:    sku_name NOT LIKE '%SERVERLESS%'
  Serverless DLT: sku_name LIKE '%SERVERLESS%'
System tables: system.billing.usage
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_dlt
# CLASSIC DLT (non-serverless SKU)
# ─────────────────────────────────────────────────────────────────────────────
DLT_CLASSIC_COST_SQL = """
SELECT
  COALESCE(u.custom_tags['pipeline_name'], u.usage_metadata.dlt_pipeline_id) AS pipeline_name,
  u.usage_metadata.dlt_pipeline_id                                          AS pipeline_id,
  COALESCE(u.custom_tags['team'], 'untagged')                               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                    AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                                      AS total_dbus,
  COUNT(DISTINCT u.usage_date)                                         AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.sku_name LIKE '%DELTA_LIVE%'
       OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY 1, 2, 3
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

DLT_CLASSIC_DAILY_SQL = """
SELECT
  u.usage_date,
  CASE WHEN u.sku_name LIKE '%ADVANCED%' THEN 'DLT Advanced'
       WHEN u.sku_name LIKE '%CORE%'     THEN 'DLT Core'
       ELSE 'DLT Other' END            AS tier,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)        AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY 1, 2
ORDER BY 1, 2
"""

DLT_CLASSIC_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                                AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.dlt_pipeline_id)                                AS pipeline_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name NOT LIKE '%SERVERLESS%'
"""

def get_dlt_classic_pipelines(workspace_id: str | None = None):
    sql = DLT_CLASSIC_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_classic_daily(workspace_id: str | None = None):
    sql = DLT_CLASSIC_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_classic_kpi(workspace_id: str | None = None):
    sql = DLT_CLASSIC_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)

# ─────────────────────────────────────────────────────────────────────────────
# SERVERLESS DLT
# ─────────────────────────────────────────────────────────────────────────────
DLT_SERVERLESS_COST_SQL = """
SELECT
  COALESCE(u.custom_tags['pipeline_name'], u.usage_metadata.dlt_pipeline_id) AS pipeline_name,
  u.usage_metadata.dlt_pipeline_id                                          AS pipeline_id,
  COALESCE(u.custom_tags['team'], 'untagged')                               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                    AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                                      AS total_dbus,
  COUNT(DISTINCT u.usage_date)                                         AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.sku_name LIKE '%DELTA_LIVE%'
       OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY 1, 2, 3
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

DLT_SERVERLESS_DAILY_SQL = """
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                   AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
"""

DLT_SERVERLESS_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                                AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.dlt_pipeline_id)                                AS pipeline_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
  AND u.sku_name LIKE '%SERVERLESS%'
"""

def get_dlt_serverless_pipelines(workspace_id: str | None = None):
    sql = DLT_SERVERLESS_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_serverless_daily(workspace_id: str | None = None):
    sql = DLT_SERVERLESS_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_serverless_kpi(workspace_id: str | None = None):
    sql = DLT_SERVERLESS_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)

# ─────────────────────────────────────────────────────────────────────────────
# COMBINED (backward compat — used for header-level has_dlt probe)
# ─────────────────────────────────────────────────────────────────────────────
DLT_COST_SQL = """
SELECT
  COALESCE(u.custom_tags['pipeline_name'], u.usage_metadata.dlt_pipeline_id) AS pipeline_name,
  u.usage_metadata.dlt_pipeline_id                                          AS pipeline_id,
  COALESCE(u.custom_tags['team'], 'untagged')                               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                    AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                                      AS total_dbus,
  COUNT(DISTINCT u.usage_date)                                         AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.sku_name LIKE '%DELTA_LIVE%'
       OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
GROUP BY 1, 2, 3
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

DLT_DAILY_SQL = """
SELECT
  u.usage_date,
  CASE WHEN u.sku_name LIKE '%SERVERLESS%' THEN 'DLT Serverless'
       WHEN u.sku_name LIKE '%ADVANCED%'   THEN 'DLT Advanced'
       WHEN u.sku_name LIKE '%CORE%'       THEN 'DLT Core'
       ELSE 'DLT Other' END              AS tier,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
GROUP BY 1, 2
ORDER BY 1, 2
"""

DLT_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                                AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)                  AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.dlt_pipeline_id)                                AS pipeline_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND (u.sku_name LIKE '%DLT%' OR u.billing_origin_product = 'DELTA_LIVE_TABLES'
       OR u.usage_metadata.dlt_pipeline_id IS NOT NULL)
"""

def get_dlt_pipelines(workspace_id: str | None = None):
    sql = DLT_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_daily(workspace_id: str | None = None):
    sql = DLT_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)
 
def get_dlt_kpi(workspace_id: str | None = None):
    sql = DLT_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_dlt(sql)

# ── New: DLT pipeline health — backlog + expectation failures ─────────────────
# Note: Use job_run_timeline which is universally available.
# Use system.lakeflow.job_run_timeline which IS available — it tracks DLT pipeline runs.
# We derive health signals from run durations and update frequencies as proxies.
DLT_PIPELINE_HEALTH_SQL = """
SELECT
  CAST(job_id AS STRING) AS pipeline_id,
  DATE(period_start_time) AS event_date,
  COUNT(run_id) AS run_count,
  ROUND(AVG(TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) / 60.0), 1) AS avg_run_min,
  SUM(CASE WHEN result_state = 'FAILED' THEN 1 ELSE 0 END) AS failed_runs,
  ROUND(SUM(CASE WHEN result_state = 'FAILED' THEN 1 ELSE 0 END) * 100.0 / COUNT(run_id), 1) AS failure_rate_pct,
  ROUND(MAX(TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) / 60.0), 1) AS max_run_min
FROM system.lakeflow.job_run_timeline
WHERE period_start_time >= CURRENT_DATE - INTERVAL 7 DAYS
GROUP BY 1, 2
ORDER BY event_date DESC, pipeline_id
"""

def get_dlt_pipeline_health(workspace_id: str | None = None):
    sql = DLT_PIPELINE_HEALTH_SQL
    if workspace_id:
        sql = sql.replace("WHERE period_start_time", f"WHERE workspace_id = '{workspace_id}' AND period_start_time")
    return run_query_dlt(sql)
 
# ── New: DLT health KPI summary ───────────────────────────────────────────────
def get_dlt_health_kpi(workspace_id: str | None = None):
    try:
        health_df = get_dlt_pipeline_health(workspace_id)
        if health_df.empty:
            return pd.DataFrame()
        total_failed  = int(health_df["failed_runs"].sum())
        avg_fail_rate = round(float(health_df["failure_rate_pct"].mean()), 1)
        max_run       = round(float(pd.to_numeric(health_df["max_run_min"], errors="coerce").max()), 1)
        # count pipelines where latest avg_run_min > earliest avg_run_min
        growing = 0
        for pipe in health_df["pipeline_id"].unique():
            sub = health_df[health_df["pipeline_id"] == pipe].sort_values("event_date")
            if len(sub) >= 2:
                first = pd.to_numeric(sub["avg_run_min"].iloc[0], errors="coerce")
                last  = pd.to_numeric(sub["avg_run_min"].iloc[-1], errors="coerce")
                if last > first * 1.1:  # >10% growth = degradation signal
                    growing += 1
        return pd.DataFrame([{
            "max_run_min":          max_run,
            "growing_pipelines":    growing,
            "total_failed_runs":    total_failed,
            "avg_failure_rate_pct": avg_fail_rate,
        }])
    except Exception:
        return pd.DataFrame()
