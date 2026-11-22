"""
log_processor/run_intelligence/dlt_event_publisher.py
══════════════════════════════════════════════════════════════════════════════
Auto-registers a DLT pipeline's event log Delta table as a named Unity Catalog
table the first time the pipeline is analyzed in the FinOps app.

Design:
  1. Check if the UC table {prefix}_{pipeline_id} already exists.
  2. If not, execute CREATE TABLE IF NOT EXISTS ... USING DELTA LOCATION ...
     via the SQL warehouse (one-time, idempotent).
  3. All subsequent event log queries use the named table (clean SQL).

Settings are sourced from config.run_intelligence_settings.
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def get_named_table_fqn(pipeline_id: str, pipeline_name: str = "") -> str:
    """Return the fully-qualified UC table name for a DLT pipeline's event log."""
    from config.run_intelligence_settings import get_dlt_event_table_fqn
    return get_dlt_event_table_fqn(pipeline_id, pipeline_name)


def dlt_table_exists(
    table_fqn: str,
    host: str,
    token: str,
    warehouse_id: str,
) -> bool:
    """
    Return True if the UC table already exists in the metastore.
    Uses SHOW TABLES to avoid triggering a full plan on the table.
    """
    from .system_table_fetcher import _run_sql
    from config.run_intelligence_settings import RIE_QUERY_TIMEOUT_SECONDS

    # Parse catalog.schema.table
    parts = table_fqn.split(".")
    if len(parts) != 3:
        return False
    catalog, schema, table = parts

    try:
        rows = _run_sql(
            f"SHOW TABLES IN `{catalog}`.`{schema}` LIKE '{table}'",
            host, token, warehouse_id, timeout_s=15,
        )
        return bool(rows)
    except Exception as e:
        logger.debug(f"[dlt_event_publisher] dlt_table_exists check failed: {e}")
        return False


def publish_dlt_event_table(
    pipeline_id: str,
    pipeline_name: str,
    storage_location: str,
    host: str,
    token: str,
    warehouse_id: str,
) -> dict[str, Any]:
    """
    Register a DLT pipeline's event log as a named Unity Catalog table.

    This is idempotent — safe to call multiple times.

    Returns:
        success        – bool
        table_fqn      – fully-qualified table name (catalog.schema.table)
        already_existed – bool: True if the table was already registered
        sql_executed   – the CREATE TABLE SQL that was (or would have been) run
        error          – error message if success=False
    """
    from config.run_intelligence_settings import (
        get_dlt_event_publish_sql,
        RIE_DLT_AUTO_PUBLISH,
        RIE_QUERY_TIMEOUT_SECONDS,
    )
    from .system_table_fetcher import _run_sql

    table_fqn = get_named_table_fqn(pipeline_id, pipeline_name)
    create_sql = get_dlt_event_publish_sql(pipeline_id, pipeline_name, storage_location)

    result: dict[str, Any] = {
        "success":        False,
        "table_fqn":      table_fqn,
        "already_existed": False,
        "sql_executed":   create_sql,
        "error":          "",
    }

    if not RIE_DLT_AUTO_PUBLISH:
        result["error"] = "RIE_DLT_AUTO_PUBLISH is disabled in settings."
        return result

    if not storage_location:
        result["error"] = "storage_location is required to publish the DLT event log table."
        return result

    # Check if already registered
    if dlt_table_exists(table_fqn, host, token, warehouse_id):
        result["success"]        = True
        result["already_existed"] = True
        return result

    # Execute the CREATE TABLE statement
    try:
        _run_sql(create_sql, host, token, warehouse_id, timeout_s=RIE_QUERY_TIMEOUT_SECONDS)
        result["success"] = True
        logger.info(f"[dlt_event_publisher] Registered: {table_fqn}")
    except Exception as e:
        result["error"] = str(e)
        logger.error(f"[dlt_event_publisher] Failed to register {table_fqn}: {e}")

    return result


def ensure_dlt_event_table(
    pipeline_id: str,
    pipeline_name: str,
    storage_location: str,
    host: str,
    token: str,
    warehouse_id: str,
) -> str:
    """
    Convenience function: ensure the DLT event table is registered, then
    return the query target string to use in SQL.

    Returns either:
      - "`catalog.schema.table`"              if named table exists/was created
      - "delta.`<storage>/system/events`"    if publishing failed or is disabled
    """
    result = publish_dlt_event_table(
        pipeline_id, pipeline_name, storage_location, host, token, warehouse_id
    )
    if result["success"]:
        return f"`{result['table_fqn']}`"
    else:
        logger.info(
            f"[dlt_event_publisher] Falling back to delta path. Reason: {result['error']}"
        )
        return f"delta.`{storage_location.rstrip('/')}/system/events`"
