# Run Intelligence Engine

> **FinOps CoPilot — Master Design & Implementation Reference**  
> Supersedes: `run_intelligence_engine_design.md` · `run_intelligence_deep_dive.md`

---

## Overview

The **Run Intelligence Engine (RIE)** replaces the legacy ClusterDNA Log Analyzer with a comprehensive, multi-source observability system for Databricks Jobs and DLT Pipelines.

Instead of analyzing only driver log files, RIE fuses **three independent data sources** into a unified `RunIntelligenceSummary` and generates AI recommendations across six optimization dimensions.

```
System Tables (always)  +  Event Logs (always)  +  Driver Logs (if configured)
        │                         │                          │
        └──────────────── RunIntelligenceSummary ────────────┘
                                  │
                    6-Dimension AI Recommendation Engine
```

---

## Part 1 — Three Data Sources

### 1A. System Tables (Primary — Maximum Coverage)

System tables in `system.lakeflow.*`, `system.compute.*`, and `system.billing.*` provide clean, typed, structured data with no log parsing required.

#### For Job Runs

| Data Point | System Table | Key Columns |
|---|---|---|
| Run identity & status | `system.lakeflow.job_run_timeline` | `job_id`, `run_id`, `result_state`, `state_message` |
| Task-level status | `system.lakeflow.job_task_run_timeline` | `task_key`, `result_state`, `attempt_number` |
| Timing | `system.lakeflow.job_run_timeline` | `period_start_time`, `period_end_time` |
| Cluster config | `system.compute.clusters` | `node_type_id`, `num_workers`, `runtime_engine` |
| DBU cost | `system.billing.usage` | `usage_quantity`, `sku_name` |
| Cost in USD | `billing.usage` JOIN `billing.list_prices` | `pricing.default × usage_quantity` |

**Key query — run summary:**
```sql
SELECT job_id, run_id, run_name, result_state, state_message,
       period_start_time, period_end_time,
       TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
FROM   system.lakeflow.job_run_timeline
WHERE  job_id = '<job_id>' AND run_id = '<run_id>';
```

#### For DLT Pipeline Runs

| Data Point | System Table | Key Columns |
|---|---|---|
| Update identity | `system.lakeflow.pipeline_update_timeline` | `pipeline_id`, `update_id`, `state`, `cause` |
| Dataset metrics | `system.lakeflow.pipeline_update_dataset_timeline` | `dataset_name`, `num_output_rows`, `backlog_bytes` |
| Flow metrics | `system.lakeflow.pipeline_update_flow_timeline` | `flow_name`, `status`, `num_output_rows` |
| DQ expectations | `system.lakeflow.pipeline_update_expectation_timeline` | `expectation_name`, `passed_records`, `failed_records` |

---

### 1B. Driver Log Files (Opt-in via Init Script)

Driver logs (stderr, stdout, log4j) are captured automatically by the `auto_log_capture.sh` init script and stored in the Unity Catalog Volume at a deterministic path.

**What we extract:**

| Signal | Source | Severity |
|---|---|---|
| Java heap OOM | stderr | CRITICAL |
| GC overhead | stderr | CRITICAL |
| Cartesian product | log4j | CRITICAL |
| Executor lost | stderr | HIGH |
| Shuffle fetch failure | stderr | HIGH |
| Stage failed | log4j | HIGH |
| Spill to disk | log4j | HIGH |
| Photon fallback | log4j | MEDIUM |
| DLT expectation failed | log4j | HIGH |
| Python tracebacks | stderr | HIGH |

Parsing is handled by `log_processor/run_intelligence/log_file_resolver.py` — the `fetch_and_parse_log_files()` function extracts signals via pattern matching.

---

### 1C. Event Logs

#### Cluster Events API (Always Available — Zero Config)

```python
POST /api/2.0/clusters/events
{
  "cluster_id": "<id>",
  "start_time": <epoch_ms>,
  "end_time":   <epoch_ms>,
  "event_types": ["RUNNING", "NODES_LOST", "DRIVER_UNAVAILABLE", ...]
}
```

Returns: node losses, autoscaling events, driver health events.

#### DLT Event Log (Always Available for Pipelines)

DLT automatically writes an event log as a Delta table:
```
<pipeline_storage_location>/system/events
```

Query directly:
```sql
SELECT timestamp, level, event_type, message,
       details:flow_progress.metrics.num_output_rows AS rows_out,
       details:flow_progress.data_quality             AS dq_metrics
FROM delta.`<storage>/system/events`
WHERE origin.update_id = '<update_id>'
ORDER BY timestamp;
```

Or via the auto-registered UC table (see Part 5):
```sql
SELECT * FROM main.finops_monitoring.rie_dlt_events_<pipeline_id>
WHERE origin.update_id = '<update_id>';
```

---

## Part 2 — Volume Structure

```
/Volumes/<catalog>/<schema>/finops_logs/
├── jobs/
│   └── <job_id>/
│       ├── run_<run_id>/               ← auto-created by init script
│       │   ├── run_metadata.json       ← written at START
│       │   ├── stderr.txt              ← copied at END
│       │   ├── stdout.txt              ← copied at END
│       │   └── log4j-active.txt        ← copied at END
│       └── run_<run_id_2>/
│
├── pipelines/
│   └── <pipeline_id>/
│       └── update_<update_id>/         ← manual placement
│
├── eventlogs/
│   └── jobs/<job_id>/<spark_app_id>/   ← Spark event log files
│
└── scripts/
    └── auto_log_capture.sh             ← init script
```

The app constructs paths **deterministically** — no searching:
```python
from config.run_intelligence_settings import get_job_log_path, get_pipeline_log_path

path = get_job_log_path(job_id="12345", run_id="901234567")
# → /Volumes/main/finops/finops_logs/jobs/12345/run_901234567
```

---

## Part 3 — Auto Log Capture Init Script

### How It Works

1. Cluster starts → `auto_log_capture.sh` runs on the driver node only (`DB_IS_DRIVER == TRUE`)
2. Script reads `DB_JOB_ID`, `DB_RUN_ID` from Databricks env vars
3. Creates the nested folder and writes `run_metadata.json` immediately at start
4. Registers an `EXIT TERM` trap — fires when the cluster shuts down
5. On exit: copies `stderr`, `stdout`, `log4j-active.log` to the Volume folder

### Deployment

Upload the script to the Volume:
```
/Volumes/main/finops/finops_logs/scripts/auto_log_capture.sh
```

Add to a job's cluster init scripts (via UI or Jobs API):
```json
{
  "init_scripts": [
    {
      "volumes": {
        "destination": "/Volumes/main/finops/finops_logs/scripts/auto_log_capture.sh"
      }
    }
  ]
}
```

Or use the helper:
```python
from config.run_intelligence_settings import get_job_init_script_config
config = get_job_init_script_config()
```

### Databricks Environment Variables Available in the Script

| Variable | Value |
|---|---|
| `DB_JOB_ID` | The Job's numeric ID |
| `DB_RUN_ID` | The current run's numeric ID |
| `DB_JOB_NAME` | The Job's display name |
| `DB_CLUSTER_ID` | The cluster running this job |
| `DB_TASK_KEY` | The specific task key |
| `DB_IS_DRIVER` | "TRUE" on the driver, "FALSE" on workers |

---

## Part 4 — DLT Event Log as Unity Catalog Table

### Why Publish as a Named Table?

Querying via `delta.` path syntax requires knowing the storage location at query time. Publishing once as a named UC table gives:
- Clean SQL (`SELECT * FROM main.finops_monitoring.rie_dlt_events_abc123`)
- Governance (Unity Catalog access controls apply)
- No path dependency at query time

### Auto-Publishing (Config-Driven)

When `RIE_DLT_AUTO_PUBLISH = True` in settings, the first time a pipeline is analyzed:

1. `dlt_event_publisher.py` checks if `{catalog}.{schema}.{prefix}_{pipeline_id}` exists
2. If not, executes `CREATE TABLE IF NOT EXISTS ... USING DELTA LOCATION ...`
3. All subsequent queries use the named table

```python
from config.run_intelligence_settings import get_dlt_event_publish_sql

sql = get_dlt_event_publish_sql(
    pipeline_id="abc123",
    pipeline_name="my_pipeline",
    storage_location="/Volumes/main/finops/pipelines/abc123"
)
# Executes:
# CREATE TABLE IF NOT EXISTS main.finops_monitoring.rie_dlt_events_abc123
# USING DELTA
# LOCATION '/Volumes/main/finops/pipelines/abc123/system/events'
# COMMENT '...'
```

### Table Naming

Controlled by `RIE_DLT_EVENT_TABLE_NAMING` in settings:

| Strategy | Table Name | Example |
|---|---|---|
| `pipeline_id` (default) | `{prefix}_{pipeline_id}` | `rie_dlt_events_abc123def456` |
| `pipeline_name` | `{prefix}_{sanitized_name}` | `rie_dlt_events_my_pipeline` |

### DLT Event Log Schema

| Column | Type | Description |
|---|---|---|
| `id` | string | Unique event ID |
| `timestamp` | timestamp | When the event occurred |
| `origin` | struct | `pipeline_id`, `update_id`, `flow_name`, `batch_id` |
| `level` | string | `INFO`, `WARN`, `ERROR`, `METRICS` |
| `event_type` | string | `flow_progress`, `create_dataset`, `maintenance` |
| `message` | string | Human-readable description |
| `error` | struct | `fatal`, `exceptions[]` |
| `details` | variant | JSON with metrics, DQ results |

**Key nested fields:**
```sql
details:flow_progress.metrics.num_output_rows
details:flow_progress.metrics.num_input_rows
details:flow_progress.data_quality.dropped_records
details:flow_progress.data_quality.expectations  -- array
details:cluster_resources.avg_task_slot_utilization
```

---

## Part 5 — Configuration Reference

All settings live in `config/run_intelligence_settings.py`. Every setting reads from an environment variable first, then falls back to the default.

### Section 1 — Unity Catalog Storage

| Setting | Default | Description |
|---|---|---|
| `RIE_UC_CATALOG` | `main` | Catalog for the finops_logs Volume |
| `RIE_UC_SCHEMA` | `finops` | Schema inside the catalog |
| `RIE_UC_VOLUME` | `finops_logs` | Volume name |
| `RIE_VOLUME_BASE_PATH` | computed | `/Volumes/{catalog}/{schema}/{volume}` |
| `RIE_INIT_SCRIPT_PATH` | computed | Full Volume path to the init script |

### Section 2 — DLT Event Log Publishing

| Setting | Default | Description |
|---|---|---|
| `RIE_DLT_EVENT_CATALOG` | `main` | Catalog for published event tables |
| `RIE_DLT_EVENT_SCHEMA` | `finops_monitoring` | Schema for event tables |
| `RIE_DLT_EVENT_TABLE_PREFIX` | `rie_dlt_events` | Table name prefix |
| `RIE_DLT_AUTO_PUBLISH` | `True` | Auto-register on first analysis |
| `RIE_DLT_EVENT_TABLE_NAMING` | `pipeline_id` | Naming strategy |

### Section 3 — Spark Event Logs

| Setting | Default | Description |
|---|---|---|
| `RIE_SPARK_EVENTLOG_ENABLED` | `True` | Enable Spark event log capture |
| `RIE_HISTORY_SERVER_ENABLED` | `True` | Query History Server API |

### Section 4 — Cluster Events API

| Setting | Default | Description |
|---|---|---|
| `RIE_CLUSTER_EVENTS_ENABLED` | `True` | Fetch cluster events |
| `RIE_CLUSTER_EVENTS_LIMIT` | `500` | Max events per analysis |
| `RIE_CLUSTER_EVENT_TYPES` | list | Event types to fetch |

### Section 5 — System Tables

All table names are fully-qualified strings, e.g.:
- `RIE_ST_JOB_RUN_TIMELINE` = `system.lakeflow.job_run_timeline`
- `RIE_ST_PIPELINE_EXPECT_TIMELINE` = `system.lakeflow.pipeline_update_expectation_timeline`

Override only if you mirror system tables to a different catalog.

### Section 6 — Run Discovery

| Setting | Default | Description |
|---|---|---|
| `RIE_MAX_RECENT_RUNS` | `30` | Runs shown in dropdown |
| `RIE_MAX_RECENT_JOBS` | `50` | Jobs shown in dropdown |
| `RIE_MAX_RECENT_PIPELINES` | `20` | Pipelines shown in dropdown |
| `RIE_DISCOVERY_LOOKBACK_DAYS` | `90` | Lookback window for discovery |
| `RIE_COMPARISON_BASELINE` | `last_successful` | Baseline strategy |

### Section 7 — Log File Capture

| Setting | Default | Description |
|---|---|---|
| `RIE_LOG_FILES_ENABLED` | `True` | Enable Volume log checks |
| `RIE_MAX_LOG_LINES` | `50000` | Max lines per log file |
| `RIE_RUN_FOLDER_PREFIX` | `run_` | Prefix for run folders |

### Section 8 — Performance

| Setting | Default | Description |
|---|---|---|
| `RIE_QUERY_TIMEOUT_SECONDS` | `60` | SQL query timeout |
| `RIE_CACHE_TTL_SECONDS` | `300` | FastAPI in-memory cache TTL for RIE system table queries (5 min) |
| `RIE_PARALLEL_FETCH_ENABLED` | `True` | Run all 3 fetches in parallel |

### Section 9 — AI Analysis

| Setting | Default | Description |
|---|---|---|
| `RIE_AI_ENABLED` | `True` | Enable AI recommendations |
| `RIE_AI_RECOMMENDATION_DIMENSIONS` | list | Which dimensions to generate |
| `RIE_HEALTH_SCORE_WEIGHTS` | dict | Penalty per severity level |

### Helper Functions

```python
from config.run_intelligence_settings import (
    get_job_log_path,            # (job_id, run_id) → Volume path
    get_pipeline_log_path,       # (pipeline_id, update_id) → Volume path
    get_spark_event_log_path,    # (job_id) → Spark eventLog.dir value
    get_dlt_event_table_fqn,     # (pipeline_id, name) → catalog.schema.table
    get_dlt_event_publish_sql,   # (pipeline_id, name, storage) → CREATE TABLE SQL
    get_spark_conf_for_job,      # (job_id) → spark_conf dict
    get_job_init_script_config,  # () → init_scripts config dict
    get_full_job_cluster_rie_config, # (job_id) → complete cluster config fragment
    get_volume_setup_sql,        # () → one-time setup SQL
    describe,                    # () → full config summary dict
)
```

---

## Part 6 — RunIntelligenceSummary Schema

The unified output of `run_preprocessor.build_run_summary()`:

```json
{
  "schema_version": "2.0",
  "generated_at":   "<ISO timestamp>",
  "entity": {
    "type":       "job | pipeline",
    "job_id":     "<id>",
    "run_id":     "<id>",
    "name":       "<display name>",
    "status":     "SUCCEEDED | FAILED | ...",
    "state_msg":  "<error message if failed>"
  },
  "timing": {
    "duration_seconds":  1234,
    "duration_mins":     20.6,
    "vs_baseline_pct":   12.5
  },
  "cost": {
    "total_dbus":     4.5,
    "total_cost_usd": 3.15,
    "sku_breakdown":  [...]
  },
  "infrastructure": {
    "driver_node_type": "m5.xlarge",
    "worker_node_type": "m5.2xlarge",
    "num_workers":       4,
    "photon_enabled":    true,
    "dbr_version":       "14.3.x-scala2.12"
  },
  "data_metrics": {
    "retries":       1,
    "task_count":    24,
    "rows_out":      1250000,
    "bytes_spilled": null
  },
  "data_quality": {
    "expectations":   [...],
    "pass_rate":      97.3,
    "failed_records": 1250,
    "has_failures":   true
  },
  "signals": [
    {
      "severity": "CRITICAL",
      "source":   "log_files",
      "category": "oom_heap",
      "message":  "Java heap OOM",
      "count":    3
    }
  ],
  "scaling_events": [...],
  "health": {
    "score": 72,
    "flags": {
      "oom": true,
      "spill": false,
      "executor_loss": false,
      "dq_failures": true
    }
  },
  "data_sources": {
    "system_tables": true,
    "event_logs":    true,
    "log_files":     false
  }
}
```

---

## Part 7 — AI Recommendation Dimensions

| Dimension | Key Signals | Example Finding |
|---|---|---|
| `infrastructure_sizing` | OOM, heap size, node type, workers | "Driver OOM × 3 on m5.xlarge. Upgrade to r5.2xlarge (32 GB RAM)." |
| `cost_optimization` | DBU cost, spot eligibility, duration | "0 retries detected — safe to switch to Spot workers. Save ~45%." |
| `spark_configuration` | Spill, shuffle, AQE | "3.2 GB spill detected. Increase `spark.sql.shuffle.partitions` to 800." |
| `transformation_query` | Cartesian product, skew | "CartesianProduct detected — add broadcast hint for 120 MB lookup table." |
| `data_quality` | Expectation failures, drop rate | "`revenue_not_null` failing 12% of records. Add upstream validation." |
| `reliability_retries` | Retry count, node loss, executor loss | "2 executor losses from Spot preemption. Add `maxRetries: 2` policy." |

---

## Part 8 — DLT Pipeline Fallback Strategy

DLT pipelines cannot be configured to auto-write driver logs. The app falls back gracefully:

```
Priority 1: System Tables          (ALWAYS — primary source)
Priority 2: DLT Event Log SQL      (ALWAYS — auto-registered UC table)
Priority 3: Cluster Events API     (ALWAYS — infrastructure events)
Priority 4: Volume Log Files       (OPTIONAL — only if manually placed)
```

Even without log files, we produce rich analysis including: run duration, dataset row counts, DQ pass/fail rates, cluster config, cost, errors, flow bottlenecks, and cluster scaling events.

---

## Part 9 — Module Structure

```
log_processor/run_intelligence/
├── __init__.py             ← Public API exports
├── system_table_fetcher.py ← All system table queries (jobs + pipelines + discovery)
├── event_log_fetcher.py    ← Cluster Events API + DLT event log SQL + Run Output API
├── dlt_event_publisher.py  ← Auto-registers DLT event log as UC table
├── log_file_resolver.py    ← Constructs Volume path, downloads logs, runs DriverLogPreprocessor
├── run_preprocessor.py     ← Unified merger → RunIntelligenceSummary
└── ai_engine.py            ← 6-dimension AI recommendations (Gemini / Anthropic / OpenAI)

config/
├── run_intelligence_settings.py  ← All RIE configuration (single source of truth)
└── settings.py                   ← App-wide config (Databricks connection, LLM keys)

pages/
└── RunIntelligence.jsx           ← React page (entity selector → run picker → analysis wizard + AI panel)

scripts/databricks/
└── auto_log_capture.sh           ← Job cluster init script for driver log capture

documentation/
└── RUN_INTELLIGENCE_ENGINE.md    ← This document
```

---

## Part 10 — One-Time Setup

### 1. Create UC Objects

Run once in your SQL Warehouse:

```sql
-- From config/run_intelligence_settings.py → get_volume_setup_sql()
CREATE SCHEMA IF NOT EXISTS main.finops_monitoring
  COMMENT 'FinOps CoPilot — RIE event log tables and monitoring views.';

CREATE VOLUME IF NOT EXISTS main.finops.finops_logs
  COMMENT 'FinOps CoPilot — Driver logs, Spark event logs, init scripts.';
```

### 2. Upload Init Script

```bash
# Upload to the Volume (one-time)
databricks fs cp scripts/databricks/auto_log_capture.sh \
  /Volumes/main/finops/finops_logs/scripts/auto_log_capture.sh
```

### 3. Configure Jobs

Add the init script to each job you want to observe:

```json
{
  "new_settings": {
    "tasks": [{
      "new_cluster": {
        "init_scripts": [
          { "volumes": { "destination": "/Volumes/main/finops/finops_logs/scripts/auto_log_capture.sh" } }
        ],
        "spark_conf": {
          "spark.eventLog.enabled": "true",
          "spark.eventLog.dir": "/Volumes/main/finops/finops_logs/eventlogs/jobs/<job_id>/"
        }
      }
    }]
  }
}
```

Or use the Python helper:
```python
from config.run_intelligence_settings import get_full_job_cluster_rie_config
cluster_config = get_full_job_cluster_rie_config(job_id="12345")
```

### 4. Launch the App

Navigate to **⚡ Run Intelligence** in the sidebar. Click **Load Jobs**, select a job, click **Load Runs**, select a run, then **Analyze Run**.

---

## Verification

```bash
# Validate settings import
python -c "from config.run_intelligence_settings import describe; import json; print(json.dumps(describe(), indent=2))"

# Validate module imports
python -c "from log_processor.run_intelligence import build_run_summary; print('OK')"
```
