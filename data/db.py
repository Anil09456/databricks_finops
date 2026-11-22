"""
data/db.py  (react_fast_api version)
═══════════════════════════════════════════════════════════════════════════════
Key differences vs the Streamlit version:
  1. fetchall_arrow().to_pandas()  — 3–10x faster columnar data transfer
  2. Module-level connection singleton (no Streamlit, thread-safe)
  3. TTL cache via api/cache.py instead of @st.cache_data
  4. ThreadPoolExecutor in refresh_all_caches() — parallel instead of sequential
═══════════════════════════════════════════════════════════════════════════════
"""
import threading
import logging
import pandas as pd
import queue
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from config.settings import (
    DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID, DATABRICKS_TOKEN,
    DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, DATABRICKS_POOL_SIZE,
    DATABRICKS_POOL_WAIT_TIMEOUT,
)

logger = logging.getLogger(__name__)

class DatabricksConnectionPool:
    def __init__(self, pool_size=5, cooldown=10.0):
        self.pool_size = pool_size
        self.cooldown = cooldown
        self.connections = queue.Queue()
        self.lock = threading.Lock()
        self.created_count = 0
        self.last_failure_time = 0.0

    def _connect(self):
        """Create a fresh connection to Databricks SQL."""
        if not DATABRICKS_HOST or not DATABRICKS_WAREHOUSE_ID:
            logger.warning("Databricks host or warehouse ID not configured.")
            return None
        try:
            from databricks import sql as dbsql
            host = DATABRICKS_HOST.rstrip("/").replace("https://", "").replace("http://", "")
            
            connect_params = {
                "server_hostname": host,
                "http_path": f"/sql/1.0/warehouses/{DATABRICKS_WAREHOUSE_ID}",
                "_retry_stop_after_attempts_count": 3,
                "_retry_delay_max": 5.0,
            }
            
            if DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET:
                logger.info("Connecting to Databricks SQL using OAuth Service Principal credentials.")
                from databricks.sdk.core import Config
                cfg = Config(
                    host=DATABRICKS_HOST,
                    client_id=DATABRICKS_CLIENT_ID,
                    client_secret=DATABRICKS_CLIENT_SECRET
                )
                connect_params["credentials_provider"] = lambda: cfg.authenticate
            else:
                logger.info("Connecting to Databricks SQL using Personal Access Token.")
                if not DATABRICKS_TOKEN:
                    logger.warning("Databricks access token not configured.")
                    return None
                connect_params["access_token"] = DATABRICKS_TOKEN
                
            conn = dbsql.connect(**connect_params)
            logger.info("Databricks SQL connection established.")
            return conn
        except Exception as exc:
            logger.error(f"Databricks connection failed: {exc}")
            return None

    def get_connection(self, timeout=None):
        """Check out a connection from the pool. Thread-safe. Verifies connection is open."""
        if timeout is None:
            timeout = DATABRICKS_POOL_WAIT_TIMEOUT
        now = time.time()
        
        while True:
            # 1. Try to get connection from queue first
            conn_from_queue = None
            with self.lock:
                if not self.connections.empty():
                    conn_from_queue = self.connections.get()
            
            if conn_from_queue is not None:
                # Check if it is still open
                if getattr(conn_from_queue, "open", False):
                    return conn_from_queue
                else:
                    logger.info("Discarding closed connection found in pool queue.")
                    with self.lock:
                        self.created_count = max(0, self.created_count - 1)
                    try:
                        conn_from_queue.close()
                    except Exception:
                        pass
                    continue # Try again
            
            # 2. Queue is empty. If we can create a new connection, do it.
            should_create = False
            with self.lock:
                if self.created_count < self.pool_size:
                    if now - self.last_failure_time < self.cooldown:
                        logger.warning("In connection failure cooldown. Skipping connection attempt.")
                        return None
                    self.created_count += 1
                    should_create = True
            
            if should_create:
                conn = self._connect()
                if conn is not None:
                    return conn
                else:
                    with self.lock:
                        self.created_count -= 1
                        self.last_failure_time = now
                    return None
            
            # 3. Queue is empty and we hit max pool size, block wait for one to return
            try:
                # We wait on the queue. If someone puts a connection, we get it.
                conn_from_wait = self.connections.get(timeout=timeout)
                if getattr(conn_from_wait, "open", False):
                    return conn_from_wait
                else:
                    logger.info("Discarding closed connection checked out after wait.")
                    with self.lock:
                        self.created_count = max(0, self.created_count - 1)
                    try:
                        conn_from_wait.close()
                    except Exception:
                        pass
                    continue
            except queue.Empty:
                logger.error(f"Timeout waiting for database connection from pool after {timeout} seconds.")
                return None

    def release_connection(self, conn, is_healthy=True):
        """Return connection to the pool or discard if unhealthy."""
        if conn is None:
            return
        if is_healthy:
            self.connections.put(conn)
        else:
            logger.info("Discarding unhealthy connection from pool.")
            try:
                conn.close()
            except Exception:
                pass
            with self.lock:
                self.created_count -= 1
                self.last_failure_time = time.time()


# Initialize connection pool singleton
_pool = DatabricksConnectionPool(pool_size=DATABRICKS_POOL_SIZE)


def get_connection():
    """Helper for compatibility/initialization checks, checking out from pool and releasing immediately."""
    conn = _pool.get_connection(timeout=5.0)
    if conn is not None:
        _pool.release_connection(conn, is_healthy=True)
    return conn


def run_query(sql_text: str) -> pd.DataFrame:
    """Execute SQL; return DataFrame. Uses Arrow for fast columnar transfer. Raises on error."""
    conn = _pool.get_connection()
    if conn is None:
        raise ConnectionError("Databricks connection could not be obtained from pool.")
    
    is_healthy = True
    try:
        with conn.cursor() as cur:
            cur.execute(sql_text)
            # Arrow transfer: 3-10x faster than fetchall() on medium/large results
            return cur.fetchall_arrow().to_pandas()
    except Exception as exc:
        logger.warning(f"Query error: {exc}")
        exc_str = str(exc).lower()
        if any(w in exc_str for w in ["retry", "connection", "session", "handshake", "network", "thrift", "timeout", "closed", "dns", "failed to resolve", "getaddrinfo"]):
            is_healthy = False
        raise exc
    finally:
        _pool.release_connection(conn, is_healthy=is_healthy)

# ── Per-section runner aliases (mirrors Streamlit db.py for import compat) ────
# The cache is handled at the router level (api/cache.py), not here.
run_query_overall      = run_query
run_query_interactive  = run_query
run_query_sql_wh       = run_query
run_query_jobs         = run_query
run_query_dlt          = run_query
run_query_storage      = run_query
run_query_chargeback   = run_query
run_query_qi           = run_query
run_query_merge        = run_query


# ── Parallel cache warm-up ────────────────────────────────────────────────────
def refresh_all_caches(cache_store=None):
    """
    Fire all 60+ queries in parallel (ThreadPoolExecutor, max 8 workers).
    Previously sequential → ~3 minutes. Now parallel → ~20-25 seconds.
    
    cache_store: optional dict-like cache to clear before refresh.
    """
    if cache_store is not None:
        cache_store.clear()

    from data.queries.usage_overview import (
        get_usage_kpi, get_daily_trend, get_sku_breakdown,
        get_cost_anomaly, get_workspace_cost, get_sku_wow,
        get_workspaces,
    )
    from data.queries.all_purpose import (
        get_ap_clusters, get_ap_daily, get_ap_kpi,
        get_ap_classic_kpi, get_ap_classic_clusters, get_ap_classic_daily,
        get_ap_serverless_kpi, get_ap_serverless_daily, get_ap_session_scan,
    )
    from data.queries.sql_warehouse import (
        get_warehouse_health, get_hourly_heatmap,
        get_top_expensive_queries, get_cache_trend,
        get_wh_classic_cost, get_wh_classic_daily,
        get_wh_serverless_cost, get_wh_serverless_daily,
        get_wh_idle_billing, get_repeat_query_kpi,
    )
    from data.queries.job_costs import (
        get_top_jobs, get_job_daily_cost, get_job_wow_change,
        get_job_classic_kpi, get_job_classic_top, get_job_classic_daily,
        get_job_serverless_kpi, get_job_serverless_top, get_job_serverless_daily,
        get_job_failed_cost, get_job_weekly_trend,
    )
    from data.queries.dlt_costs import (
        get_dlt_pipelines, get_dlt_daily, get_dlt_kpi,
        get_dlt_classic_pipelines, get_dlt_classic_daily, get_dlt_classic_kpi,
        get_dlt_serverless_pipelines, get_dlt_serverless_daily, get_dlt_serverless_kpi,
        get_dlt_pipeline_health, get_dlt_health_kpi,
    )
    from data.queries.storage_health import (
        get_storage_cost_trend, get_table_sizes, get_zombie_risk, get_storage_kpi,
        get_vacuum_compliance, get_retain0_kpi,
    )
    from data.queries.chargeback import get_team_spend, get_tag_coverage
    from data.queries.query_intelligence import (
        get_qi_kpi, get_spill_events, get_spill_kpi,
        get_repeat_queries, get_cache_breaker_users, get_shuffle_ratio,
    )
    from data.queries.merge_health import (
        get_merge_kpi, get_merge_trend, get_lc_candidates,
        get_write_amplification, get_pyspark_write_audit,
    )

    all_fns = [
        get_workspace_cost, get_usage_kpi, get_daily_trend,
        get_sku_breakdown, get_cost_anomaly, get_sku_wow,
        get_workspaces,
        get_ap_clusters, get_ap_daily, get_ap_kpi,
        get_ap_classic_kpi, get_ap_classic_clusters, get_ap_classic_daily,
        get_ap_serverless_kpi, get_ap_serverless_daily, get_ap_session_scan,
        get_warehouse_health, get_hourly_heatmap,
        get_top_expensive_queries, get_cache_trend,
        get_wh_classic_cost, get_wh_classic_daily,
        get_wh_serverless_cost, get_wh_serverless_daily,
        get_wh_idle_billing, get_repeat_query_kpi,
        get_top_jobs, get_job_daily_cost, get_job_wow_change,
        get_job_classic_kpi, get_job_classic_top, get_job_classic_daily,
        get_job_serverless_kpi, get_job_serverless_top, get_job_serverless_daily,
        get_job_failed_cost, get_job_weekly_trend,
        get_dlt_pipelines, get_dlt_daily, get_dlt_kpi,
        get_dlt_classic_pipelines, get_dlt_classic_daily, get_dlt_classic_kpi,
        get_dlt_serverless_pipelines, get_dlt_serverless_daily, get_dlt_serverless_kpi,
        get_dlt_pipeline_health, get_dlt_health_kpi,
        get_storage_cost_trend, get_table_sizes,
        get_zombie_risk, get_storage_kpi,
        get_vacuum_compliance, get_retain0_kpi,
        get_team_spend, get_tag_coverage,
        get_qi_kpi, get_spill_events, get_spill_kpi,
        get_repeat_queries, get_cache_breaker_users, get_shuffle_ratio,
        get_merge_kpi, get_merge_trend, get_lc_candidates,
        get_write_amplification, get_pyspark_write_audit,
    ]

    import api.cache as cache_lib

    fn_keys = {
        # Overall
        get_workspace_cost: ["overall:workspace_cost"],
        get_usage_kpi: ["overall:kpi"],
        get_daily_trend: ["overall:trend"],
        get_sku_breakdown: ["overall:sku_breakdown"],
        get_cost_anomaly: ["overall:anomaly"],
        get_sku_wow: ["overall:sku_wow"],
        get_workspaces: ["overall:workspaces"],
        get_warehouse_health: ["overall:warehouse_health", "sql_wh:health"],
        get_tag_coverage: ["overall:tag_coverage", "chargeback:tag_coverage"],
        get_zombie_risk: ["overall:zombie_risk", "storage:zombie_risk"],
        
        # Interactive
        get_ap_classic_kpi: ["interactive:classic_kpi"],
        get_ap_classic_clusters: ["interactive:classic_clusters"],
        get_ap_classic_daily: ["interactive:classic_daily"],
        get_ap_serverless_kpi: ["interactive:serverless_kpi"],
        get_ap_serverless_daily: ["interactive:serverless_daily"],
        get_ap_session_scan: ["interactive:session_scan"],
        get_ap_kpi: ["interactive:kpi"],
        
        # SQL Warehouse
        get_hourly_heatmap: ["sql_wh:heatmap"],
        get_top_expensive_queries: ["sql_wh:top_queries"],
        get_cache_trend: ["sql_wh:cache_trend"],
        get_wh_classic_cost: ["sql_wh:classic_cost"],
        get_wh_classic_daily: ["sql_wh:classic_daily"],
        get_wh_serverless_cost: ["sql_wh:serverless_cost"],
        get_wh_serverless_daily: ["sql_wh:serverless_daily"],
        get_wh_idle_billing: ["sql_wh:idle_billing"],
        get_repeat_query_kpi: ["sql_wh:repeat_query_kpi"],
        
        # Jobs
        get_top_jobs: ["jobs:top"],
        get_job_daily_cost: ["jobs:daily"],
        get_job_wow_change: ["jobs:wow_change"],
        get_job_classic_kpi: ["jobs:classic_kpi"],
        get_job_classic_top: ["jobs:classic_top"],
        get_job_classic_daily: ["jobs:classic_daily"],
        get_job_serverless_kpi: ["jobs:serverless_kpi"],
        get_job_serverless_top: ["jobs:serverless_top"],
        get_job_serverless_daily: ["jobs:serverless_daily"],
        get_job_failed_cost: ["jobs:failed_cost"],
        get_job_weekly_trend: ["jobs:weekly_trend"],
        
        # DLT
        get_dlt_pipelines: ["dlt:pipelines"],
        get_dlt_daily: ["dlt:daily"],
        get_dlt_kpi: ["dlt:kpi"],
        get_dlt_classic_pipelines: ["dlt:classic_pipelines"],
        get_dlt_classic_daily: ["dlt:classic_daily"],
        get_dlt_classic_kpi: ["dlt:classic_kpi"],
        get_dlt_serverless_pipelines: ["dlt:serverless_pipelines"],
        get_dlt_serverless_daily: ["dlt:serverless_daily"],
        get_dlt_serverless_kpi: ["dlt:serverless_kpi"],
        get_dlt_pipeline_health: ["dlt:pipeline_health"],
        get_dlt_health_kpi: ["dlt:health_kpi"],
        
        # Storage
        get_storage_cost_trend: ["storage:cost_trend"],
        get_table_sizes: ["storage:table_sizes"],
        get_storage_kpi: ["storage:kpi"],
        get_vacuum_compliance: ["storage:vacuum_compliance"],
        get_retain0_kpi: ["storage:retain0_kpi"],
        
        # Chargeback
        get_team_spend: ["chargeback:team_spend"],
        
        # Query Intelligence
        get_qi_kpi: ["qi:kpi"],
        get_spill_events: ["qi:spill_events"],
        get_spill_kpi: ["qi:spill_kpi"],
        get_repeat_queries: ["qi:repeat_queries"],
        get_cache_breaker_users: ["qi:cache_breaker_users"],
        get_shuffle_ratio: ["qi:shuffle_ratio"],
        
        # Merge & Clustering
        get_merge_kpi: ["merge:kpi"],
        get_merge_trend: ["merge:trend"],
        get_lc_candidates: ["merge:lc_candidates"],
        get_write_amplification: ["merge:write_amplification"],
        get_pyspark_write_audit: ["merge:pyspark_write_audit"],
    }

    def _safe(fn):
        try:
            val = fn()
            if cache_store is not None and fn in fn_keys:
                for k in fn_keys[fn]:
                    cache_lib.set(k, val)
        except Exception as exc:
            logger.warning(f"Refresh failed for {fn.__name__}: {exc}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_safe, fn): fn.__name__ for fn in all_fns}
        for future in as_completed(futures):
            pass   # errors already logged inside _safe

    logger.info("refresh_all_caches() complete.")
