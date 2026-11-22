"""
data/queries/sql_warehouse.py
════════════════════════════════════════════════════════════════════════════
Queries for the SQL Warehouse Performance dashboard.

System tables used:
  • system.query.history   — per-query performance metrics (classic + serverless)
  • system.billing.usage   — cost KPIs split by classic vs serverless SKU

Databricks billing_origin_product for warehouses: 'SQL'
  Classic / Pro warehouses: sku_name NOT LIKE '%SERVERLESS%'
  Serverless warehouses:    sku_name LIKE '%SERVERLESS%'

Performance thresholds (basis for "Analyze Issue"):
  • Cache hit rate < 60%  → Module 1 (Caching)
  • Queued queries > 5    → Module 15 (Warehouse Saturation)
  • P90 duration > 120s   → Module 14, 7, 8
  • Failed queries > 2%   → Module 5 (Observability)
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_sql_wh

rng = np.random.default_rng(42)

def _dates(n, offset=0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── 1. Per-warehouse health summary (all warehouses — classic + serverless) ───
WH_HEALTH_SQL = """
SELECT
  qh.compute.warehouse_id                                                               AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), qh.compute.warehouse_id)                              AS warehouse_name,
  COUNT(*)                                                                              AS total_queries,
  ROUND(AVG(qh.total_task_duration_ms) / 1000.0, 1)                                     AS avg_duration_s,
  ROUND(PERCENTILE(qh.total_task_duration_ms, 0.90) / 1000.0, 1)                        AS p90_duration_s,
  ROUND(100.0 * COUNT(*) FILTER (WHERE qh.from_result_cache = true) / COUNT(*), 1)      AS cache_hit_pct,
  COUNT(*) FILTER (WHERE qh.waiting_at_capacity_duration_ms > 0)                        AS queued_count,
  COUNT(*) FILTER (WHERE qh.execution_status = 'FAILED')                                AS failed_count,
  ROUND(SUM(qh.read_bytes) / 1e9, 1)                                                    AS total_gb_scanned
FROM system.query.history qh
LEFT JOIN system.compute.warehouses w
  ON qh.compute.warehouse_id = w.warehouse_id
WHERE qh.start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND qh.compute.warehouse_id IS NOT NULL
  AND qh.execution_status IN ('FINISHED', 'FAILED')
GROUP BY 1
ORDER BY total_queries DESC
"""

def get_warehouse_health(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_HEALTH_SQL
    if workspace_id:
        sql = sql.replace("WHERE qh.start_time", f"WHERE qh.workspace_id = '{workspace_id}' AND qh.start_time")
    return run_query_sql_wh(sql)

# ── 2. Hourly query volume heatmap (7 days × 24 hours) ───────────────────────
HOURLY_HEATMAP_SQL = """
SELECT
  DAYOFWEEK(start_time)                                                          AS day_of_week,
  HOUR(start_time)                                                               AS hour_of_day,
  COUNT(*)                                                                       AS query_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE waiting_at_capacity_duration_ms > 0) / COUNT(*), 1) AS queue_pct
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND execution_status IN ('FINISHED', 'FAILED')
GROUP BY 1, 2
ORDER BY 1, 2
"""

def get_hourly_heatmap(workspace_id: str | None = None) -> pd.DataFrame:
    sql = HOURLY_HEATMAP_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_sql_wh(sql)

# ── 3. Top 10 expensive queries (by GB scanned) ───────────────────────────────
TOP_EXPENSIVE_SQL = """
SELECT
  executed_by                                  AS executed_by,
  compute.warehouse_id                         AS warehouse_id,
  ROUND(read_bytes / 1e9, 2)                   AS gb_scanned,
  ROUND(total_task_duration_ms / 1000.0, 1)    AS duration_s,
  from_result_cache,
  DATE(start_time)                             AS query_date,
  LEFT(statement_text, 140)                    AS query_preview
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND read_bytes  > 500e6
  AND execution_status = 'FINISHED'
ORDER BY read_bytes DESC
LIMIT 10
"""

def get_top_expensive_queries(workspace_id: str | None = None) -> pd.DataFrame:
    sql = TOP_EXPENSIVE_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_sql_wh(sql)

# ── 4. Cache hit trend (7-day daily) ─────────────────────────────────────────
CACHE_TREND_SQL = """
SELECT
  DATE(qh.start_time)                                                            AS query_date,
  qh.compute.warehouse_id                                                        AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), qh.compute.warehouse_id)                        AS warehouse_name,
  ROUND(100.0 * COUNT(*) FILTER (WHERE qh.from_result_cache = true) / COUNT(*), 1) AS cache_hit_pct,
  COUNT(*)                                                                       AS total_queries
FROM system.query.history qh
LEFT JOIN system.compute.warehouses w
  ON qh.compute.warehouse_id = w.warehouse_id
WHERE qh.start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND qh.compute.warehouse_id IS NOT NULL
  AND qh.execution_status = 'FINISHED'
GROUP BY 1, 2
ORDER BY 1, 2
"""

def get_cache_trend(workspace_id: str | None = None) -> pd.DataFrame:
    sql = CACHE_TREND_SQL
    if workspace_id:
        sql = sql.replace("WHERE qh.start_time", f"WHERE qh.workspace_id = '{workspace_id}' AND qh.start_time")
    return run_query_sql_wh(sql)

# ── 5. Classic/Pro Warehouse cost KPI (billing.usage, non-serverless SKU) ─────
WH_CLASSIC_COST_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.sku_name)                                               AS sku_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'SQL'
  AND u.sku_name NOT LIKE '%SERVERLESS%'
"""

WH_CLASSIC_DAILY_SQL = """
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
  AND u.billing_origin_product = 'SQL'
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
"""

def get_wh_classic_cost(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_CLASSIC_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_sql_wh(sql)

def get_wh_classic_daily(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_CLASSIC_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_sql_wh(sql)

# ── 6. Serverless Warehouse cost KPI (billing.usage, serverless SKU) ──────────
WH_SERVERLESS_COST_SQL = """
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.sku_name)                                               AS sku_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'SQL'
  AND u.sku_name LIKE '%SERVERLESS%'
"""

WH_SERVERLESS_DAILY_SQL = """
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
  AND u.billing_origin_product = 'SQL'
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
"""

def get_wh_serverless_cost(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_SERVERLESS_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_sql_wh(sql)

def get_wh_serverless_daily(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_SERVERLESS_DAILY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_sql_wh(sql)

# ── 7. Idle warehouse billing ─────────────────────────────────────────────────
WH_IDLE_BILLING_SQL = """
WITH billed AS (
  SELECT
    u.usage_metadata.warehouse_id                  AS warehouse_id,
    COUNT(DISTINCT u.usage_date)                   AS billed_days,
    ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS total_cost_usd
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
    AND u.billing_origin_product = 'SQL'
  GROUP BY 1
),
active AS (
  SELECT
    qh.compute.warehouse_id                        AS warehouse_id,
    COUNT(DISTINCT DATE(qh.start_time))            AS active_days,
    COUNT(*)                                       AS total_queries
  FROM system.query.history qh
  WHERE qh.start_time >= CURRENT_DATE - INTERVAL 7 DAYS
    AND qh.execution_status IN ('FINISHED', 'FAILED')
  GROUP BY 1
)
SELECT
  b.warehouse_id,
  COALESCE(w.warehouse_name, b.warehouse_id)      AS warehouse_name,
  b.billed_days,
  COALESCE(a.active_days, 0)                      AS active_days,
  b.billed_days - COALESCE(a.active_days, 0)      AS idle_days,
  ROUND(100.0 * (b.billed_days - COALESCE(a.active_days, 0))
        / NULLIF(b.billed_days, 0), 1)             AS idle_pct,
  b.total_cost_usd,
  ROUND(b.total_cost_usd
        * (b.billed_days - COALESCE(a.active_days, 0))
        / NULLIF(b.billed_days, 0), 2)             AS estimated_idle_cost_usd
FROM billed b
LEFT JOIN active a ON b.warehouse_id = a.warehouse_id
LEFT JOIN system.compute.warehouses w ON b.warehouse_id = w.warehouse_id
ORDER BY estimated_idle_cost_usd DESC
"""

def get_wh_idle_billing(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_IDLE_BILLING_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
        sql = sql.replace("WHERE qh.start_time", f"WHERE qh.workspace_id = '{workspace_id}' AND qh.start_time")
    return run_query_sql_wh(sql)

# ── 8. Repeat query count (for MV opportunity detection) ─────────────────────
WH_REPEAT_QUERY_SQL = """
SELECT
  COUNT(*) FILTER (
    WHERE run_count >= 50 AND avg_gb >= 5.0
  )                          AS mv_candidate_count,
  COUNT(*) FILTER (
    WHERE run_count >= 10 AND avg_gb >= 1.0
  )                          AS repeat_query_count,
  ROUND(SUM(wasted_gb), 1)   AS total_wasted_gb
FROM (
  SELECT
    COUNT(*)                                    AS run_count,
    ROUND(AVG(read_bytes) / 1e9, 2)            AS avg_gb,
    ROUND(SUM(read_bytes) FILTER (WHERE from_result_cache = false) / 1e9, 1)
                                                AS wasted_gb
  FROM system.query.history
  WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
    AND execution_status = 'FINISHED'
    AND read_bytes > 1073741824
  GROUP BY LEFT(statement_text, 100)
)
"""

def get_repeat_query_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    sql = WH_REPEAT_QUERY_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_sql_wh(sql)
