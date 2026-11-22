"""
log_processor/run_intelligence/__init__.py
══════════════════════════════════════════════════════════════════════════════
Run Intelligence Engine — multi-source data processing sub-package.

Public API:
    from log_processor.run_intelligence import (
        fetch_system_tables,
        fetch_event_logs,
        check_log_files,
        publish_dlt_event_table,
        build_run_summary,
        get_rie_ai_recommendations,
    )
══════════════════════════════════════════════════════════════════════════════
"""

from .system_table_fetcher import fetch_job_system_tables, fetch_pipeline_system_tables
from .event_log_fetcher import fetch_cluster_events, fetch_dlt_event_log, fetch_job_run_output
from .log_file_resolver import check_log_files, resolve_log_path
from .dlt_event_publisher import publish_dlt_event_table, dlt_table_exists
from .run_preprocessor import build_run_summary
from .ai_engine import get_rie_ai_recommendations

__all__ = [
    "fetch_job_system_tables",
    "fetch_pipeline_system_tables",
    "fetch_cluster_events",
    "fetch_dlt_event_log",
    "fetch_job_run_output",
    "check_log_files",
    "resolve_log_path",
    "publish_dlt_event_table",
    "dlt_table_exists",
    "build_run_summary",
    "get_rie_ai_recommendations",
]
