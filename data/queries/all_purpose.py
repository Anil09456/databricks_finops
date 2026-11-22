"""
data/queries/all_purpose.py
Queries for Interactive Computes dashboard (Classic + Serverless).
System tables: system.billing.usage, system.compute.clusters

Databricks billing_origin_product values:
  Classic all-purpose/interactive clusters  → 'ALL_PURPOSE'
  Serverless interactive compute (notebooks) → 'INTERACTIVE'
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_interactive

rng = np.random.default_rng(42)

def _dates(n, offset=0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── Combined (both products) — kept for backward compat ───────────────────────
AP_TOP_CLUSTERS_SQL = """
SELECT
  u.usage_metadata.cluster_id                               AS cluster_id,
  COALESCE(u.custom_tags['cluster_name'],
           u.usage_metadata.cluster_id)                    AS cluster_name,
  COALESCE(u.custom_tags['team'],  'untagged')             AS team,
  COALESCE(u.custom_tags['user'],  'unknown')              AS owner,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS total_dbus,
  COUNT(DISTINCT u.usage_date)                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product IN ('ALL_PURPOSE', 'INTERACTIVE')
  AND u.usage_metadata.cluster_id IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

AP_DAILY_SQL = """
SELECT
  u.usage_date,
  COALESCE(u.custom_tags['team'], 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product IN ('ALL_PURPOSE', 'INTERACTIVE')
GROUP BY 1, 2
ORDER BY 1, 2
"""

AP_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.cluster_id)                              AS cluster_count,
  COUNT(DISTINCT COALESCE(u.custom_tags['team'], 'untagged'))              AS team_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product IN ('ALL_PURPOSE', 'INTERACTIVE')
"""

# ── Classic Interactive (billing_origin_product = 'ALL_PURPOSE') ──────────────
# Classic all-purpose clusters are billed under 'ALL_PURPOSE' in system.billing.usage
AP_CLASSIC_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.cluster_id)                              AS cluster_count,
  COUNT(DISTINCT COALESCE(u.custom_tags['team'], 'untagged'))              AS team_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
"""

AP_CLASSIC_CLUSTERS_SQL = """
SELECT
  u.usage_metadata.cluster_id                               AS cluster_id,
  COALESCE(u.custom_tags['cluster_name'],
           u.usage_metadata.cluster_id)                    AS cluster_name,
  COALESCE(u.custom_tags['team'],  'untagged')             AS team,
  COALESCE(u.custom_tags['user'],  'unknown')              AS owner,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS total_dbus,
  COUNT(DISTINCT u.usage_date)                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
  AND u.usage_metadata.cluster_id IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY cost_30d_usd DESC
LIMIT 15
"""

AP_CLASSIC_DAILY_SQL = """
SELECT
  u.usage_date,
  COALESCE(u.custom_tags['team'], 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
GROUP BY 1, 2
ORDER BY 1, 2
"""

# ── Serverless Interactive (billing_origin_product = 'INTERACTIVE') ───────────
# Serverless compute (notebooks) is billed under 'INTERACTIVE' in system.billing.usage
AP_SERVERLESS_KPI_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT COALESCE(u.usage_metadata.cluster_id, u.usage_metadata.endpoint_id)) AS session_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'INTERACTIVE'
"""

AP_SERVERLESS_DAILY_SQL = """
SELECT
  u.usage_date,
  COALESCE(u.custom_tags['team'], 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'INTERACTIVE'
GROUP BY 1, 2
ORDER BY 1, 2
"""

# ── Mock helpers ──────────────────────────────────────────────────────────────
# ── Public API ────────────────────────────────────────────────────────────────
def get_ap_clusters(workspace_id: str | None = None):
    sql = AP_TOP_CLUSTERS_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_daily(workspace_id: str | None = None):
    sql = AP_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_kpi(workspace_id: str | None = None):
    sql = AP_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_classic_kpi(workspace_id: str | None = None):
    sql = AP_CLASSIC_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_classic_clusters(workspace_id: str | None = None):
    sql = AP_CLASSIC_CLUSTERS_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_classic_daily(workspace_id: str | None = None):
    sql = AP_CLASSIC_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_serverless_kpi(workspace_id: str | None = None):
    sql = AP_SERVERLESS_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

def get_ap_serverless_daily(workspace_id: str | None = None):
    sql = AP_SERVERLESS_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_interactive(sql)

# ── New: GB scanned per session trend (serverless interactive) ────────────────
AP_SESSION_SCAN_SQL = """
SELECT
  DATE(start_time)                                   AS query_date,
  COUNT(DISTINCT session_id)                         AS session_count,
  ROUND(SUM(read_bytes) / 1e9, 2)                   AS total_gb_scanned,
  ROUND(AVG(read_bytes) / 1e9, 3)                   AS avg_gb_per_query,
  ROUND(SUM(read_bytes) / NULLIF(COUNT(DISTINCT session_id), 0) / 1e9, 2)
                                                     AS avg_gb_per_session
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 14 DAYS
  AND session_id IS NOT NULL
  AND execution_status = 'FINISHED'
GROUP BY 1
ORDER BY 1
"""

def get_ap_session_scan(workspace_id: str | None = None):
    sql = AP_SESSION_SCAN_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_interactive(sql)
