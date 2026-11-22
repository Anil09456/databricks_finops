"""
data/queries/cost_lookup.py
Developer Cost Lookup Toolkit — search by job, pipeline, cluster, warehouse,
user, or notebook. Flexible date range (1 week to 1 year).
System tables: system.billing.usage, system.query.history
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query

rng = np.random.default_rng(42)

def _dates(n, offset=0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── Job cost lookup by job name / job ID ─────────────────────────────────────
def job_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  u.usage_date,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus,
  COUNT(DISTINCT u.usage_metadata.job_run_id)               AS run_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND (LOWER(u.usage_metadata.job_id) LIKE LOWER('%{like}%')
    OR LOWER(j.name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.job_id, u.usage_date, u.sku_name
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

def job_cost_summary_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)               AS total_runs,
  ROUND(AVG(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS avg_cost_per_run,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND (LOWER(u.usage_metadata.job_id) LIKE LOWER('%{like}%')
    OR LOWER(j.name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.job_id
ORDER BY total_cost_usd DESC
"""

# ── Pipeline (DLT) cost lookup ────────────────────────────────────────────────
def pipeline_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.dlt_pipeline_id                              AS pipeline_id,
  COALESCE(MAX(p.name), u.usage_metadata.dlt_pipeline_id)  AS pipeline_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')              AS team,
  u.usage_date,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)        AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                          AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.pipelines p
  ON u.usage_metadata.dlt_pipeline_id = p.pipeline_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.dlt_pipeline_id IS NOT NULL
  AND (LOWER(u.usage_metadata.dlt_pipeline_id) LIKE LOWER('%{like}%')
    OR LOWER(p.name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.dlt_pipeline_id, u.usage_date, u.sku_name
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

def pipeline_cost_summary_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.dlt_pipeline_id                              AS pipeline_id,
  COALESCE(MAX(p.name), u.usage_metadata.dlt_pipeline_id)  AS pipeline_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS total_dbus,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  MIN(u.usage_date)                                        AS first_seen,
  MAX(u.usage_date)                                        AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.pipelines p
  ON u.usage_metadata.dlt_pipeline_id = p.pipeline_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.dlt_pipeline_id IS NOT NULL
  AND (LOWER(u.usage_metadata.dlt_pipeline_id) LIKE LOWER('%{like}%')
    OR LOWER(p.name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.dlt_pipeline_id
ORDER BY total_cost_usd DESC
"""

# ── Cluster cost lookup ───────────────────────────────────────────────────────
def cluster_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.cluster_id                              AS cluster_id,
  COALESCE(MAX(c.cluster_name), u.usage_metadata.cluster_id) AS cluster_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')             AS team,
  u.billing_origin_product,
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)       AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                         AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.clusters c
  ON u.usage_metadata.cluster_id = c.cluster_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.cluster_id IS NOT NULL
  AND (LOWER(u.usage_metadata.cluster_id) LIKE LOWER('%{like}%')
    OR LOWER(c.cluster_name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.cluster_id, u.billing_origin_product, u.usage_date
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

def cluster_cost_summary_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.cluster_id                             AS cluster_id,
  COALESCE(MAX(c.cluster_name), u.usage_metadata.cluster_id) AS cluster_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')            AS team,
  u.billing_origin_product                               AS product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)      AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                        AS total_dbus,
  COUNT(DISTINCT u.usage_date)                           AS active_days,
  MIN(u.usage_date)                                      AS first_seen,
  MAX(u.usage_date)                                      AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.clusters c
  ON u.usage_metadata.cluster_id = c.cluster_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.cluster_id IS NOT NULL
  AND (LOWER(u.usage_metadata.cluster_id) LIKE LOWER('%{like}%')
    OR LOWER(c.cluster_name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.cluster_id, u.billing_origin_product
ORDER BY total_cost_usd DESC
"""

# ── Warehouse cost lookup ─────────────────────────────────────────────────────
def warehouse_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_date,
  u.usage_metadata.warehouse_id                             AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), u.usage_metadata.warehouse_id) AS warehouse_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.warehouses w
  ON u.usage_metadata.warehouse_id = w.warehouse_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.warehouse_id IS NOT NULL
  AND (LOWER(u.usage_metadata.warehouse_id) LIKE LOWER('%{like}%')
    OR LOWER(w.warehouse_name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.warehouse_id, u.usage_date
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

def warehouse_cost_summary_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  u.usage_metadata.warehouse_id                             AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), u.usage_metadata.warehouse_id) AS warehouse_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.warehouses w
  ON u.usage_metadata.warehouse_id = w.warehouse_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.usage_metadata.warehouse_id IS NOT NULL
  AND (LOWER(u.usage_metadata.warehouse_id) LIKE LOWER('%{like}%')
    OR LOWER(w.warehouse_name) LIKE LOWER('%{like}%'))
  {ws_filter}
GROUP BY u.usage_metadata.warehouse_id
ORDER BY total_cost_usd DESC
"""

def warehouse_query_stats_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  compute.warehouse_id                                  AS warehouse_id,
  DATE(start_time)                                      AS query_date,
  COUNT(*)                                              AS query_count,
  ROUND(SUM(read_bytes) / 1073741824.0, 2)             AS total_gb_scanned,
  ROUND(AVG(total_task_duration_ms) / 1000.0, 1)       AS avg_duration_s,
  ROUND(MAX(total_task_duration_ms) / 1000.0, 1)       AS max_duration_s,
  COUNT(*) FILTER (WHERE execution_status = 'FAILED')  AS failed_queries,
  COUNT(*) FILTER (WHERE from_result_cache = true)     AS cached_queries
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL {days} DAYS
  AND LOWER(compute.warehouse_id) LIKE LOWER('%{like}%')
  AND execution_status IN ('FINISHED','FAILED')
  {ws_filter}
GROUP BY 1, 2
ORDER BY query_date DESC, total_gb_scanned DESC
LIMIT 200
"""

# ── User cost lookup ──────────────────────────────────────────────────────────
def user_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  LOWER(u.identity_metadata.run_as)                         AS user_name,
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.identity_metadata.run_as IS NOT NULL
  AND LOWER(u.identity_metadata.run_as) LIKE LOWER('%{like}%')
  {ws_filter}
GROUP BY 1, 2
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

def user_cost_summary_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  LOWER(u.identity_metadata.run_as)                         AS user_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.identity_metadata.run_as IS NOT NULL
  AND LOWER(u.identity_metadata.run_as) LIKE LOWER('%{like}%')
  {ws_filter}
GROUP BY 1
ORDER BY total_cost_usd DESC
"""

def user_query_stats_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  LOWER(executed_by)                                    AS user_name,
  DATE(start_time)                                      AS query_date,
  COUNT(*)                                              AS query_count,
  ROUND(SUM(read_bytes) / 1073741824.0, 2)             AS total_gb_scanned,
  ROUND(AVG(total_task_duration_ms) / 1000.0, 1)       AS avg_duration_s,
  COUNT(*) FILTER (WHERE from_result_cache = true)     AS cached_hits,
  ROUND(100.0 * COUNT(*) FILTER (WHERE from_result_cache = true) / COUNT(*), 1) AS cache_pct
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL {days} DAYS
  AND LOWER(executed_by) LIKE LOWER('%{like}%')
  AND execution_status = 'FINISHED'
  {ws_filter}
GROUP BY 1, 2
ORDER BY query_date DESC, total_gb_scanned DESC
LIMIT 200
"""

# ── Notebook cost lookup ──────────────────────────────────────────────────────
def notebook_cost_sql(search: str, days: int, workspace_id: str | None = None) -> str:
    like = search.replace("'", "''")
    ws_filter = f"AND u.workspace_id = '{workspace_id}'" if workspace_id else ""
    return f"""
SELECT
  COALESCE(u.usage_metadata.notebook_id, 'unknown')       AS notebook_id,
  COALESCE(u.usage_metadata.notebook_id, 'unknown')       AS notebook_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')        AS team,
  u.usage_date,
  u.billing_origin_product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)       AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                         AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL {days} DAYS
  AND u.billing_origin_product IN ('INTERACTIVE', 'INTERACTIVE_SERVERLESS')
  AND u.usage_metadata.notebook_id IS NOT NULL
  AND LOWER(u.usage_metadata.notebook_id) LIKE LOWER('%{like}%')
  {ws_filter}
GROUP BY u.usage_metadata.notebook_id, u.usage_date, u.billing_origin_product
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
"""

# ── Generic runners ───────────────────────────────────────────────────────────
def lookup_job(search: str, days: int, workspace_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    return run_query(job_cost_sql(search, days, workspace_id)), run_query(job_cost_summary_sql(search, days, workspace_id))

def lookup_pipeline(search: str, days: int, workspace_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    return run_query(pipeline_cost_sql(search, days, workspace_id)), run_query(pipeline_cost_summary_sql(search, days, workspace_id))

def lookup_cluster(search: str, days: int, workspace_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    return run_query(cluster_cost_sql(search, days, workspace_id)), run_query(cluster_cost_summary_sql(search, days, workspace_id))

def lookup_warehouse(search: str, days: int, workspace_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    return run_query(warehouse_cost_sql(search, days, workspace_id)), run_query(warehouse_cost_summary_sql(search, days, workspace_id)), run_query(warehouse_query_stats_sql(search, days, workspace_id))

def lookup_user(search: str, days: int, workspace_id: str | None = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    return run_query(user_cost_sql(search, days, workspace_id)), run_query(user_cost_summary_sql(search, days, workspace_id)), run_query(user_query_stats_sql(search, days, workspace_id))

def lookup_notebook(search: str, days: int, workspace_id: str | None = None) -> pd.DataFrame:
    return run_query(notebook_cost_sql(search, days, workspace_id))

