"""
config/run_intelligence_settings.py
══════════════════════════════════════════════════════════════════════════════
Run Intelligence Engine (RIE) — Single Source of Truth for all configuration.

This module is the control plane for the entire Run Intelligence Engine.
Every path, every toggle, every table name, every API limit is defined here.
No hard-coded values anywhere else in the RIE codebase.

SECTIONS
────────
  1. Unity Catalog — Volume & Storage Topology
  2. DLT Event Log Publishing (UC Table Registration)
  3. Spark Application Event Logs (History Server)
  4. Cluster Events API
  5. System Table Names
  6. Run Discovery & UI Limits
  7. Driver Log File Capture
  8. Performance & Caching
  9. AI Analysis Engine
 10. Helper Functions (path builders, config payloads)

HOW TO USE
──────────
  • Local dev  : set env vars or edit the defaults below
  • Databricks : set via job environment variables or Databricks Secrets
  • All paths  : use the helper functions — never construct paths manually

ENVIRONMENT VARIABLE OVERRIDE PATTERN
  Every setting reads from an env var first, then falls back to the default.
  Example:
      RIE_UC_CATALOG = os.getenv("RIE_UC_CATALOG", "main")
"""

from __future__ import annotations
import os
from typing import Literal


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1 — Unity Catalog: Volume & Storage Topology
# ═══════════════════════════════════════════════════════════════════════════

# The catalog where the finops_logs Volume lives.
RIE_UC_CATALOG: str = os.getenv("RIE_UC_CATALOG", "main")

# The schema (database) inside that catalog.
RIE_UC_SCHEMA: str = os.getenv("RIE_UC_SCHEMA", "finops")

# The Unity Catalog Volume name.
RIE_UC_VOLUME: str = os.getenv("RIE_UC_VOLUME", "finops_logs")

# Computed base path
RIE_VOLUME_BASE_PATH: str = f"/Volumes/{RIE_UC_CATALOG}/{RIE_UC_SCHEMA}/{RIE_UC_VOLUME}"

# Sub-paths within the volume
RIE_JOBS_SUBPATH:      str = "jobs"
RIE_PIPELINES_SUBPATH: str = "pipelines"
RIE_EVENTLOGS_SUBPATH: str = "eventlogs"
RIE_SCRIPTS_SUBPATH:   str = "scripts"

# Full path where the auto_log_capture.sh init script is stored.
RIE_INIT_SCRIPT_PATH: str = (
    f"{RIE_VOLUME_BASE_PATH}/{RIE_SCRIPTS_SUBPATH}/auto_log_capture.sh"
)


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2 — DLT Event Log: Unity Catalog Table Publishing
# ═══════════════════════════════════════════════════════════════════════════

# Catalog where DLT event tables are published.
RIE_DLT_EVENT_CATALOG: str = os.getenv("RIE_DLT_EVENT_CATALOG", "main")

# Schema (database) where DLT event tables are published.
RIE_DLT_EVENT_SCHEMA: str = os.getenv("RIE_DLT_EVENT_SCHEMA", "finops_monitoring")

# Prefix for all auto-published DLT event log tables.
RIE_DLT_EVENT_TABLE_PREFIX: str = os.getenv("RIE_DLT_EVENT_TABLE_PREFIX", "rie_dlt_events")

# Naming strategy for published event tables.
RIE_DLT_EVENT_TABLE_NAMING: Literal["pipeline_id", "pipeline_name"] = os.getenv(
    "RIE_DLT_EVENT_TABLE_NAMING", "pipeline_id"
)

# If True, the app will auto-publish the DLT event log as a UC table
RIE_DLT_AUTO_PUBLISH: bool = os.getenv("RIE_DLT_AUTO_PUBLISH", "true").lower() == "true"

# If True, also create a unified cross-pipeline view:
RIE_DLT_CREATE_UNIFIED_VIEW: bool = os.getenv(
    "RIE_DLT_CREATE_UNIFIED_VIEW", "true"
).lower() == "true"

# Name of the unified cross-pipeline event view
RIE_DLT_UNIFIED_VIEW_NAME: str = os.getenv(
    "RIE_DLT_UNIFIED_VIEW_NAME", "all_pipeline_events"
)

# Table properties applied when registering the DLT event log table
RIE_DLT_EVENT_TABLE_COMMENT: str = (
    "Auto-registered DLT pipeline event log. "
    "Managed by FinOps CoPilot — Run Intelligence Engine."
)


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3 — Spark Application Event Logs (Job History Server)
# ═══════════════════════════════════════════════════════════════════════════

# Master toggle for Spark event log capture.
RIE_SPARK_EVENTLOG_ENABLED: bool = os.getenv(
    "RIE_SPARK_EVENTLOG_ENABLED", "true"
).lower() == "true"

# Directory template where Spark event logs are written per job.
RIE_SPARK_EVENTLOG_DIR_TEMPLATE: str = (
    f"{RIE_VOLUME_BASE_PATH}/{RIE_EVENTLOGS_SUBPATH}/jobs/{{job_id}}/"
)

# Whether to query the History Server REST API for stage/task metrics.
RIE_HISTORY_SERVER_ENABLED: bool = os.getenv(
    "RIE_HISTORY_SERVER_ENABLED", "true"
).lower() == "true"

# History Server API base path
RIE_HISTORY_SERVER_API_BASE: str = "/api/v1/applications"

# Max stages to fetch per application
RIE_HISTORY_SERVER_MAX_STAGES: int = int(os.getenv("RIE_HISTORY_SERVER_MAX_STAGES", "200"))


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4 — Cluster Events API
# ═══════════════════════════════════════════════════════════════════════════

# Master toggle
RIE_CLUSTER_EVENTS_ENABLED: bool = os.getenv(
    "RIE_CLUSTER_EVENTS_ENABLED", "true"
).lower() == "true"

# Event types to fetch from the Cluster Events API.
RIE_CLUSTER_EVENT_TYPES: list[str] = [
    "RUNNING",
    "RESIZING",
    "UPSIZE_COMPLETED",
    "DOWNSIZE_COMPLETED",
    "NODES_LOST",
    "DRIVER_HEALTHY",
    "DRIVER_UNAVAILABLE",
    "AUTOSCALING_STATS_REPORT",
    "PINNED",
    "UNPINNED",
    "INIT_SCRIPTS_STARTED",
    "INIT_SCRIPTS_FINISHED",
    "SPARK_EXCEPTION",
]

# Maximum number of cluster events to retrieve per analysis run.
RIE_CLUSTER_EVENTS_LIMIT: int = int(os.getenv("RIE_CLUSTER_EVENTS_LIMIT", "500"))

# Job Run Output API: max bytes of stdout/stderr to retrieve as fallback.
RIE_JOB_RUN_OUTPUT_ENABLED: bool = os.getenv(
    "RIE_JOB_RUN_OUTPUT_ENABLED", "true"
).lower() == "true"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5 — System Table Names
# ═══════════════════════════════════════════════════════════════════════════

# ── LakeFlow ──────────────────────────────────────────────────────────────
RIE_ST_JOB_RUN_TIMELINE:          str = "system.lakeflow.job_run_timeline"
RIE_ST_JOB_TASK_RUN_TIMELINE:     str = "system.lakeflow.job_task_run_timeline"
RIE_ST_PIPELINE_UPDATE_TIMELINE:  str = "system.lakeflow.pipeline_update_timeline"
RIE_ST_PIPELINE_DATASET_TIMELINE: str = "system.lakeflow.pipeline_update_dataset_timeline"
RIE_ST_PIPELINE_FLOW_TIMELINE:    str = "system.lakeflow.pipeline_update_flow_timeline"
RIE_ST_PIPELINE_EXPECT_TIMELINE:  str = "system.lakeflow.pipeline_update_expectation_timeline"

# ── Billing ───────────────────────────────────────────────────────────────
RIE_ST_BILLING_USAGE:             str = "system.billing.usage"
RIE_ST_BILLING_LIST_PRICES:       str = "system.billing.list_prices"

# ── Compute ───────────────────────────────────────────────────────────────
RIE_ST_CLUSTERS:                  str = "system.compute.clusters"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 6 — Run Discovery & UI Limits
# ═══════════════════════════════════════════════════════════════════════════

# How many recent runs to show in the run selector dropdown.
RIE_MAX_RECENT_RUNS: int = int(os.getenv("RIE_MAX_RECENT_RUNS", "30"))

# How many recent pipelines to show in the pipeline selector dropdown.
RIE_MAX_RECENT_PIPELINES: int = int(os.getenv("RIE_MAX_RECENT_PIPELINES", "20"))

# How many recent jobs to show in the job selector dropdown.
RIE_MAX_RECENT_JOBS: int = int(os.getenv("RIE_MAX_RECENT_JOBS", "50"))

# Baseline for run-over-run comparison
RIE_COMPARISON_BASELINE: Literal["last_successful", "previous", "7d_avg"] = os.getenv(
    "RIE_COMPARISON_BASELINE", "last_successful"
)

# Lookback window for populating dropdowns
RIE_DISCOVERY_LOOKBACK_DAYS: int = int(os.getenv("RIE_DISCOVERY_LOOKBACK_DAYS", "90"))


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 7 — Driver Log File Capture
# ═══════════════════════════════════════════════════════════════════════════

# Master toggle.
RIE_LOG_FILES_ENABLED: bool = os.getenv(
    "RIE_LOG_FILES_ENABLED", "true"
).lower() == "true"

# Expected file names in the run folder.
RIE_LOG_FILE_NAMES: dict[str, list[str]] = {
    "stderr": ["stderr.txt", "stderr"],
    "stdout": ["stdout.txt", "stdout"],
    "log4j":  ["log4j-active.txt", "log4j-active.log", "log4j.log"],
    "metadata": ["run_metadata.json"],
}

# Maximum lines to read from each log file
RIE_MAX_LOG_LINES: int = int(os.getenv("RIE_MAX_LOG_LINES", "50000"))

# Number of lines to read from start + end of a truncated log file.
RIE_LOG_HEAD_LINES: int = int(os.getenv("RIE_LOG_HEAD_LINES", "5000"))

# Prefix for run folder names
RIE_RUN_FOLDER_PREFIX: str = "run_"

# Prefix for pipeline update folder names.
RIE_UPDATE_FOLDER_PREFIX: str = "update_"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 8 — Performance & Caching
# ═══════════════════════════════════════════════════════════════════════════

# SQL query timeout for system table queries (seconds).
RIE_QUERY_TIMEOUT_SECONDS: int = int(os.getenv("RIE_QUERY_TIMEOUT_SECONDS", "60"))

# How long to cache system table query results in session (seconds).
RIE_CACHE_TTL_SECONDS: int = int(os.getenv("RIE_CACHE_TTL_SECONDS", "300"))

# If True, system tables + cluster events + log file check run in parallel threads.
RIE_PARALLEL_FETCH_ENABLED: bool = False

# Timeout for a single parallel fetch thread (seconds).
RIE_PARALLEL_FETCH_TIMEOUT: int = int(os.getenv("RIE_PARALLEL_FETCH_TIMEOUT", "30"))


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 9 — AI Analysis Engine
# ═══════════════════════════════════════════════════════════════════════════

# Master toggle for AI recommendations.
RIE_AI_ENABLED: bool = os.getenv("RIE_AI_ENABLED", "true").lower() == "true"

# Which recommendation dimensions to include.
RIE_AI_RECOMMENDATION_DIMENSIONS: list[str] = [
    "infrastructure_sizing",
    "cost_optimization",
    "spark_configuration",
    "transformation_query",
    "data_quality",
    "reliability_retries",
]

# Health score penalty weights per severity
RIE_HEALTH_SCORE_WEIGHTS: dict[str, int] = {
    "CRITICAL": 30,
    "HIGH":     15,
    "MEDIUM":   8,
    "LOW":      2,
    "INFO":     0,
}

# Maximum number of signals to include per severity in the AI prompt.
RIE_AI_MAX_SIGNALS_PER_SEVERITY: dict[str, int] = {
    "CRITICAL": 10,
    "HIGH":     10,
    "MEDIUM":   5,
    "LOW":      3,
}


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 10 — Helper Functions
# ═══════════════════════════════════════════════════════════════════════════

def get_job_log_path(job_id: str | int, run_id: str | int) -> str:
    return (
        f"{RIE_VOLUME_BASE_PATH}/{RIE_JOBS_SUBPATH}"
        f"/{job_id}/{RIE_RUN_FOLDER_PREFIX}{run_id}"
    )


def get_pipeline_log_path(pipeline_id: str, update_id: str) -> str:
    return (
        f"{RIE_VOLUME_BASE_PATH}/{RIE_PIPELINES_SUBPATH}"
        f"/{pipeline_id}/{RIE_UPDATE_FOLDER_PREFIX}{update_id}"
    )


def get_spark_event_log_path(job_id: str | int) -> str:
    return RIE_SPARK_EVENTLOG_DIR_TEMPLATE.format(job_id=job_id)


def get_dlt_event_table_fqn(pipeline_id: str, pipeline_name: str = "") -> str:
    if RIE_DLT_EVENT_TABLE_NAMING == "pipeline_name" and pipeline_name:
        safe_name = "".join(c if c.isalnum() else "_" for c in pipeline_name.lower())
        identifier = safe_name[:50]
    else:
        identifier = pipeline_id.replace("-", "_")

    table_name = f"{RIE_DLT_EVENT_TABLE_PREFIX}_{identifier}"
    return f"{RIE_DLT_EVENT_CATALOG}.{RIE_DLT_EVENT_SCHEMA}.{table_name}"


def get_dlt_event_publish_sql(
    pipeline_id: str,
    pipeline_name: str,
    storage_location: str,
) -> str:
    fqn = get_dlt_event_table_fqn(pipeline_id, pipeline_name)
    events_path = f"{storage_location.rstrip('/')}/system/events"
    comment = (
        f"{RIE_DLT_EVENT_TABLE_COMMENT} "
        f"Pipeline: '{pipeline_name}' (ID: {pipeline_id})."
    )
    return f"""CREATE TABLE IF NOT EXISTS {fqn}
USING DELTA
LOCATION '{events_path}'
COMMENT '{comment}';"""


def get_spark_conf_for_job(job_id: str | int) -> dict[str, str]:
    return {
        "spark.eventLog.enabled": "true",
        "spark.eventLog.dir": get_spark_event_log_path(job_id),
    }


def get_job_init_script_config() -> dict:
    return {
        "volumes": {
            "destination": RIE_INIT_SCRIPT_PATH
        }
    }


def get_full_job_cluster_rie_config(job_id: str | int) -> dict:
    config: dict = {}

    if RIE_SPARK_EVENTLOG_ENABLED:
        config["spark_conf"] = get_spark_conf_for_job(job_id)

    if RIE_LOG_FILES_ENABLED:
        config["init_scripts"] = [get_job_init_script_config()]

    config["cluster_log_conf"] = {
        "dbfs": {
            "destination": (
                f"dbfs:/cluster-logs/{job_id}"
            )
        }
    }

    return config


def get_volume_setup_sql() -> str:
    return f"""-- FinOps CoPilot: Run Intelligence Engine — One-time Setup SQL
-- Run this in your SQL Warehouse as a user with CREATE privileges.

-- 1. Create the monitoring schema
CREATE SCHEMA IF NOT EXISTS {RIE_DLT_EVENT_CATALOG}.{RIE_DLT_EVENT_SCHEMA}
  COMMENT 'FinOps CoPilot — Run Intelligence Engine event log tables and monitoring views.';

-- 2. Create the Volume for log storage
CREATE VOLUME IF NOT EXISTS {RIE_UC_CATALOG}.{RIE_UC_SCHEMA}.{RIE_UC_VOLUME}
  COMMENT 'FinOps CoPilot — Centralized store for driver logs, Spark event logs, and init scripts.';

-- 3. Confirm creation
SHOW VOLUMES IN {RIE_UC_CATALOG}.{RIE_UC_SCHEMA};
SHOW SCHEMAS IN {RIE_DLT_EVENT_CATALOG};
"""


def describe() -> dict:
    return {
        "volume": {
            "catalog": RIE_UC_CATALOG,
            "schema":  RIE_UC_SCHEMA,
            "volume":  RIE_UC_VOLUME,
            "base_path": RIE_VOLUME_BASE_PATH,
            "init_script": RIE_INIT_SCRIPT_PATH,
        },
        "dlt_event_publishing": {
            "enabled":         RIE_DLT_AUTO_PUBLISH,
            "catalog":         RIE_DLT_EVENT_CATALOG,
            "schema":          RIE_DLT_EVENT_SCHEMA,
            "table_prefix":    RIE_DLT_EVENT_TABLE_PREFIX,
            "naming_strategy": RIE_DLT_EVENT_TABLE_NAMING,
            "unified_view":    RIE_DLT_CREATE_UNIFIED_VIEW,
        },
        "spark_event_log": {
            "enabled":         RIE_SPARK_EVENTLOG_ENABLED,
            "dir_template":    RIE_SPARK_EVENTLOG_DIR_TEMPLATE,
            "history_server":  RIE_HISTORY_SERVER_ENABLED,
        },
        "cluster_events": {
            "enabled":  RIE_CLUSTER_EVENTS_ENABLED,
            "limit":    RIE_CLUSTER_EVENTS_LIMIT,
            "types":    RIE_CLUSTER_EVENT_TYPES,
        },
        "run_discovery": {
            "max_runs":      RIE_MAX_RECENT_RUNS,
            "max_jobs":      RIE_MAX_RECENT_JOBS,
            "max_pipelines": RIE_MAX_RECENT_PIPELINES,
            "lookback_days": RIE_DISCOVERY_LOOKBACK_DAYS,
            "baseline":      RIE_COMPARISON_BASELINE,
        },
        "log_files": {
            "enabled":       RIE_LOG_FILES_ENABLED,
            "max_lines":     RIE_MAX_LOG_LINES,
            "file_names":    RIE_LOG_FILE_NAMES,
        },
        "ai": {
            "enabled":       RIE_AI_ENABLED,
            "dimensions":    RIE_AI_RECOMMENDATION_DIMENSIONS,
        },
        "performance": {
            "query_timeout_s":  RIE_QUERY_TIMEOUT_SECONDS,
            "cache_ttl_s":      RIE_CACHE_TTL_SECONDS,
            "parallel_fetch":   RIE_PARALLEL_FETCH_ENABLED,
        },
    }
