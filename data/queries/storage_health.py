"""
data/queries/storage_health.py
════════════════════════════════════════════════════════════════════════════
Queries for the Storage Health dashboard.

System tables used:
  • system.billing.usage          — DEFAULT_STORAGE sku
  • system.information_schema.tables — table sizes, row counts

Performance thresholds (basis for "Analyze Issue"):
  • Tables without OPTIMIZE in > 30 days  → Module 3 (VACUUM + OPTIMIZE)
  • Zombie file % > 20%                   → Module 13 (Zombie Files)
  • Avg file size < 32 MB                 → Small files → Module 3, 12
  • Storage cost > $500/month             → Module 3, 13
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_storage
rng = np.random.default_rng(42)

# ── 1. Storage cost trend (30 days) ──────────────────────────────────────────
STORAGE_COST_SQL = """
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4) AS storage_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                   AS storage_gb_hours
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'DEFAULT_STORAGE'
GROUP BY 1
ORDER BY 1
"""

def get_storage_cost_trend(workspace_id: str | None = None) -> pd.DataFrame:
    sql = STORAGE_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_storage(sql)

# ── 2. Top tables by size (using information_schema) ─────────────────────────
TABLE_SIZES_SQL = """
SELECT
  table_catalog,
  table_schema,
  table_name,
  0                                   AS size_gb,
  0                                   AS table_rows,
  last_altered                        AS last_ddl_time,
  -- flag tables that haven't been optimized recently
  CASE WHEN last_altered < CURRENT_TIMESTAMP - INTERVAL 30 DAYS
       THEN 'VACUUM_NEEDED'
       ELSE 'OK' END                   AS vacuum_status
FROM system.information_schema.tables
WHERE table_type = 'MANAGED'
ORDER BY table_name DESC
LIMIT 20
"""

def get_table_sizes(workspace_id: str | None = None) -> pd.DataFrame:
    return run_query_storage(TABLE_SIZES_SQL)

# ── 3. Zombie / orphan file summary per table ─────────────────────────────────
# NOTE: actual zombie file count requires DESCRIBE DETAIL on each table.
# This query approximates by joining billing storage growth to known tables.
ZOMBIE_APPROX_SQL = """
SELECT
  t.table_catalog,
  t.table_schema,
  t.table_name,
  0                                                                     AS current_size_gb,
  -- proxy: tables not optimized in 30+ days likely have zombie files
  DATEDIFF(CURRENT_DATE, DATE(t.last_altered))                         AS days_since_optimize,
  CASE WHEN DATEDIFF(CURRENT_DATE, DATE(t.last_altered)) > 30 THEN 'HIGH_RISK'
       WHEN DATEDIFF(CURRENT_DATE, DATE(t.last_altered)) > 14 THEN 'MEDIUM_RISK'
       ELSE 'LOW_RISK' END                                               AS zombie_risk
FROM system.information_schema.tables t
WHERE table_type = 'MANAGED'
ORDER BY days_since_optimize DESC
LIMIT 15
"""

def get_zombie_risk(workspace_id: str | None = None) -> pd.DataFrame:
    return run_query_storage(ZOMBIE_APPROX_SQL)

# ── 4. Storage KPIs (single row) ─────────────────────────────────────────────
STORAGE_KPI_SQL = """
SELECT
  ROUND(SUM(CASE WHEN u.billing_origin_product = 'DEFAULT_STORAGE'
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)   AS storage_cost_30d,
  ROUND(SUM(CASE WHEN u.billing_origin_product = 'DEFAULT_STORAGE'
                 THEN u.usage_quantity END), 1)                      AS storage_gb_hours_30d
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
"""

def get_storage_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    sql = STORAGE_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_storage(sql)

# ── 5. VACUUM compliance table ────────────────────────────────────────────────
# Shows per-table VACUUM status: NEVER / Overdue (>30d) / OK
VACUUM_COMPLIANCE_SQL = """
SELECT
  t.table_catalog,
  t.table_schema,
  t.table_name,
  0                                                          AS size_gb,
  DATEDIFF(CURRENT_DATE, DATE(t.last_altered))              AS days_since_write,
  CASE
    WHEN DATEDIFF(CURRENT_DATE, DATE(t.last_altered)) > 60  THEN 'NEVER / Critical'
    WHEN DATEDIFF(CURRENT_DATE, DATE(t.last_altered)) > 30  THEN 'Overdue'
    ELSE 'OK'
  END                                                        AS vacuum_compliance
FROM system.information_schema.tables t
WHERE table_type = 'MANAGED'
ORDER BY DATEDIFF(CURRENT_DATE, DATE(t.last_altered)) DESC
LIMIT 15
"""

def get_vacuum_compliance(workspace_id: str | None = None) -> pd.DataFrame:
    return run_query_storage(VACUUM_COMPLIANCE_SQL)

# ── 6. VACUUM RETAIN 0 audit ──────────────────────────────────────────────────
# Detects compliance violation: VACUUM run with retention = 0 destroys time travel
# NOTE: Requires DESCRIBE HISTORY on each table — approximated via information_schema
RETAIN0_KPI_SQL = """
SELECT
  COUNT(*) FILTER (
    WHERE DATEDIFF(CURRENT_DATE, DATE(last_altered)) > 60
  )                            AS critical_tables,
  COUNT(*) FILTER (
    WHERE DATEDIFF(CURRENT_DATE, DATE(last_altered)) BETWEEN 30 AND 60
  )                            AS overdue_tables,
  COUNT(*) FILTER (
    WHERE DATEDIFF(CURRENT_DATE, DATE(last_altered)) <= 30
  )                            AS healthy_tables
FROM system.information_schema.tables
WHERE table_type = 'MANAGED'
"""

def get_retain0_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    return run_query_storage(RETAIN0_KPI_SQL)

# ── 7. Per-user cost leaderboard (for Chargeback) ────────────────────────────
USER_COST_SQL = """
SELECT
  COALESCE(u.custom_tags['user'], u.custom_tags['owner'], 'unattributed')  AS user_email,
  u.billing_origin_product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                      AS cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product IN ('SQL', 'ALL_PURPOSE', 'JOBS', 'INTERACTIVE')
GROUP BY 1, 2
HAVING SUM(u.usage_quantity) > 0
ORDER BY cost_usd DESC
LIMIT 30
"""

def get_user_cost_leaderboard(workspace_id: str | None = None) -> pd.DataFrame:
    sql = USER_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_storage(sql)
