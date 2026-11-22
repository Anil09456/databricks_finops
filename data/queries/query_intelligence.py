"""
data/queries/query_intelligence.py
════════════════════════════════════════════════════════════════════════════
Queries for the Query Intelligence dashboard.

System tables used:
  • system.query.history — spilled_local_bytes (actual col name in system.query.history), from_result_cache,
    total_task_duration_ms, total_duration_ms, statement_text,
    read_bytes, executed_by, compute.warehouse_id

Signals → Modules:
  • spilled_local_bytes > 0         → M11 (Spill & Skew) + M7 (AQE)
  • repeat query freq > 50/day      → M14 (Dashboard $18K) + M1 (Caching)
  • CURRENT_DATE/RAND in query text → M1 (Caching — cache-breaker)
  • task_dur / total_dur > 4x       → M4 (Narrow vs Wide) + M8 (Broadcast Join)
  • gb_scanned > 5GB on fast query  → M2 (Partitioning) + M6 (Z-Order)
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_sql_wh, run_query_qi

rng = np.random.default_rng(42)

def _dates(n, offset=0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── 1. Spill events (last 7 days) ────────────────────────────────────────────
SPILL_EVENTS_SQL = """
SELECT
  executed_by,
  compute.warehouse_id                              AS warehouse_id,
  DATE(start_time)                                  AS query_date,
  ROUND(spilled_local_bytes / 1e9, 3)              AS spill_gb,
  ROUND(read_bytes / 1e9, 2)                        AS read_gb,
  ROUND(spilled_local_bytes * 100.0
        / NULLIF(read_bytes, 0), 1)                 AS spill_pct_of_read,
  ROUND(total_duration_ms / 1000.0, 1)              AS duration_s,
  LEFT(statement_text, 120)                         AS query_preview
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND spilled_local_bytes > 0
  AND execution_status = 'FINISHED'
ORDER BY spilled_local_bytes DESC
LIMIT 15
"""

def get_spill_events(workspace_id: str | None = None) -> pd.DataFrame:
    sql = SPILL_EVENTS_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)

# ── 2. Spill KPI summary ──────────────────────────────────────────────────────
SPILL_KPI_SQL = """
SELECT
  COUNT(*)                                          AS spill_event_count,
  ROUND(SUM(spilled_local_bytes) / 1e9, 2)         AS total_spill_gb,
  ROUND(AVG(spilled_local_bytes * 100.0
        / NULLIF(read_bytes, 0)), 1)                AS avg_spill_pct,
  COUNT(DISTINCT executed_by)                       AS affected_users
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND spilled_local_bytes > 0
  AND execution_status = 'FINISHED'
"""

def get_spill_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    sql = SPILL_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)

# ── 3. Repeat query / MV candidates ──────────────────────────────────────────
# Queries running >50x/day AND reading >5GB are strong MV candidates
REPEAT_QUERY_SQL = """
SELECT
  executed_by,
  compute.warehouse_id                              AS warehouse_id,
  COUNT(*)                                          AS run_count,
  ROUND(AVG(read_bytes) / 1e9, 2)                  AS avg_gb_per_run,
  ROUND(AVG(total_duration_ms) / 1000.0, 1)        AS avg_duration_s,
  COUNT(*) FILTER (WHERE from_result_cache = true)  AS cache_hits,
  ROUND(100.0 * COUNT(*) FILTER (WHERE from_result_cache = true)
        / COUNT(*), 1)                              AS cache_hit_pct,
  LEFT(statement_text, 100)                         AS query_sample
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND execution_status = 'FINISHED'
  AND read_bytes > 1073741824
GROUP BY executed_by, compute.warehouse_id, LEFT(statement_text, 100)
HAVING COUNT(*) >= 10
ORDER BY run_count DESC
LIMIT 15
"""

def get_repeat_queries(workspace_id: str | None = None) -> pd.DataFrame:
    sql = REPEAT_QUERY_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)

# ── 4. Cache-breaker pattern per user ─────────────────────────────────────────
# Queries with volatile functions (CURRENT_DATE, RAND, NOW, CURRENT_TIMESTAMP)
# that permanently defeat result cache
CACHE_BREAKER_SQL = """
SELECT
  executed_by,
  COUNT(*)                                                               AS total_queries,
  COUNT(*) FILTER (
    WHERE statement_text LIKE '%CURRENT_DATE%'
       OR statement_text LIKE '%RAND()%'
       OR statement_text LIKE '%NOW()%'
       OR statement_text LIKE '%CURRENT_TIMESTAMP%'
       OR statement_text LIKE '%CURRENT_TIME%'
  )                                                                      AS cache_breaker_count,
  ROUND(100.0 * COUNT(*) FILTER (
    WHERE statement_text LIKE '%CURRENT_DATE%'
       OR statement_text LIKE '%RAND()%'
       OR statement_text LIKE '%NOW()%'
       OR statement_text LIKE '%CURRENT_TIMESTAMP%'
       OR statement_text LIKE '%CURRENT_TIME%'
  ) / NULLIF(COUNT(*), 0), 1)                                           AS cache_breaker_pct,
  ROUND(SUM(read_bytes) FILTER (WHERE from_result_cache = false) / 1e9, 2)
                                                                         AS wasted_scan_gb
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND execution_status = 'FINISHED'
  AND executed_by IS NOT NULL
GROUP BY 1
HAVING COUNT(*) >= 5
ORDER BY cache_breaker_count DESC
LIMIT 10
"""

def get_cache_breaker_users(workspace_id: str | None = None) -> pd.DataFrame:
    sql = CACHE_BREAKER_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)

# ── 5. Task/Total duration shuffle proxy ──────────────────────────────────────
# High ratio (total_task_duration >> total_duration) = many wide transforms / shuffles
SHUFFLE_RATIO_SQL = """
SELECT
  compute.warehouse_id                              AS warehouse_id,
  DATE(start_time)                                  AS query_date,
  ROUND(AVG(
    total_task_duration_ms / NULLIF(total_duration_ms, 0)
  ), 2)                                             AS avg_task_total_ratio,
  COUNT(*) FILTER (
    WHERE total_task_duration_ms > total_duration_ms * 4
      AND total_duration_ms > 0
  )                                                  AS high_shuffle_count,
  COUNT(*)                                           AS total_queries,
  ROUND(AVG(read_bytes) / 1e9, 2)                   AS avg_gb_scanned
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND execution_status = 'FINISHED'
  AND total_duration_ms > 0
  AND compute.warehouse_id IS NOT NULL
GROUP BY compute.warehouse_id, DATE(start_time)
ORDER BY DATE(start_time) DESC, avg_task_total_ratio DESC
"""

def get_shuffle_ratio(workspace_id: str | None = None) -> pd.DataFrame:
    sql = SHUFFLE_RATIO_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)

# ── 6. Query Intelligence KPIs (single-row summary) ───────────────────────────
QI_KPI_SQL = """
SELECT
  COUNT(*) FILTER (WHERE spilled_local_bytes > 0)   AS spill_query_count,
  ROUND(SUM(spilled_local_bytes) / 1e9, 1)          AS total_spill_gb,
  COUNT(DISTINCT executed_by) FILTER (
    WHERE spilled_local_bytes > 0)                   AS spill_users,
  SUM(CASE
    WHEN statement_text LIKE '%CURRENT_DATE%'
      OR statement_text LIKE '%RAND()%'
      OR statement_text LIKE '%NOW()%'
    THEN 1 ELSE 0 END)                               AS cache_breaker_queries,
  COUNT(*) FILTER (WHERE from_result_cache = false
    AND read_bytes > 5368709120)                     AS large_uncached_queries,
  ROUND(AVG(
    CASE WHEN total_duration_ms > 0
    THEN total_task_duration_ms / total_duration_ms
    END), 2)                                         AS avg_shuffle_ratio
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 7 DAYS
  AND execution_status = 'FINISHED'
"""

def get_qi_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    sql = QI_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE start_time", f"WHERE workspace_id = '{workspace_id}' AND start_time")
    return run_query_qi(sql)
