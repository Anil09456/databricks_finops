# ⚙️ Configuration Reference — FinOps Copilot

> **Audience:** Developers setting up the app for the first time, platform engineers tuning production settings, and anyone who needs to understand how a specific setting works without reading the source code.
>
> This document explains every configurable setting in the application — what it does, which file to change, and what happens if you leave it at the default.

---

## 📋 Table of Contents

- [How the Configuration System Works](#how-the-configuration-system-works)
- [File 1: config/settings.py — Core Application Settings](#file-1-configsettingspy--core-application-settings)
  - [Databricks Connection Settings](#databricks-connection-settings)
  - [Notebook Reference Settings](#notebook-reference-settings)
  - [LLM Provider Settings](#llm-provider-settings)
  - [App Behaviour Settings](#app-behaviour-settings)
  - [Helper Functions Exported by settings.py](#helper-functions-exported-by-settingspy)
- [File 2: log_processor/log_processor_settings.py — ClusterDNA Settings](#file-2-log_processorlog_processor_settingspy--clusterdna-settings)
- [File 3: app.yaml — Production Deployment Overrides](#file-3-appyaml--production-deployment-overrides)
- [File 4: config/notebook_config.py — Intelligence Routing Maps](#file-4-confignotebook_configpy--intelligence-routing-maps)
  - [MODULE_CELLS — The 20 Optimization Modules](#module_cells--the-20-optimization-modules)
  - [DASHBOARD_MODULE_MAP — Dashboard → Modules](#dashboard_module_map--dashboard--modules)
  - [ISSUE_ROUTING — Issue Signals → Modules](#issue_routing--issue-signals--modules)
  - [CHART_MODULE_MAP — Per-Chart Module Deep Links](#chart_module_map--per-chart-module-deep-links)
  - [How to Update a Notebook Cell ID](#how-to-update-a-notebook-cell-id)
- [Cache Architecture — Isolated Query Buckets](#cache-architecture--isolated-query-buckets)
- [Theme System — Dark and Light Mode](#theme-system--dark-and-light-mode)
- [Adding a New Configuration Variable — The Correct Pattern](#adding-a-new-configuration-variable--the-correct-pattern)

---

## How the Configuration System Works

FinOps Copilot uses a **layered, override-based configuration system** inspired by the [12-Factor App methodology](https://12factor.net/config). This means all configuration is externalized — the same Python code runs in local development and production Databricks Apps, only the *source* of the configuration changes.

### The Two Layers

```
LAYER 1 (lowest priority): Hardcoded defaults in Python files
         ↓ overridden by ↓
LAYER 2 (highest priority): Environment variables (set by shell, or by app.yaml in Databricks Apps)
```

**Example:** `DATABRICKS_WAREHOUSE_ID` in `config/settings.py`:
```python
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "your_sql_warehouse_id")
```
- **Local dev:** `os.getenv()` finds no environment variable → uses the hardcoded `"your_sql_warehouse_id"` default
- **Databricks Apps:** `app.yaml` injects `DATABRICKS_WAREHOUSE_ID=abc123def456` as an env var → `os.getenv()` returns `"abc123def456"`, ignoring the hardcoded value

### The Golden Rule

> **Edit `config/settings.py` for local development only.**  
> **Edit `app.yaml` to configure what runs in Databricks Apps.**  
> **Never hardcode secrets in any file tracked by Git.**

💡 **Note on Variable Syncing:** To ensure transparency and ease of configuration for the deployment user, any default values defined in `config/settings.py` (like fallback notebook IDs, paths, or warehouse IDs) are also explicitly mirrored in the `app.yaml` file. If a variable is declared in `app.yaml`, the deployed app will use that injected value. If it is omitted from `app.yaml`, it will fallback to the default value coded in `settings.py`.


### Where Each Setting Lives

| When you want to change... | Edit this file |
|---|---|
| Databricks connection, notebook, LLM provider, cache TTL | `config/settings.py` (local) or `app.yaml` (production) |
| Gemini API key for ClusterDNA log analysis | `log_processor/log_processor_settings.py` (local) or Databricks Secrets + `app.yaml` secrets section |
| Production environment variables (non-secret) | `app.yaml` — `env:` section |
| Production secrets (API keys) | Databricks Secrets API + `app.yaml` — `secrets:` section |
| Which notebook cells each module maps to | `config/notebook_config.py` |
| Which modules each chart links to | `config/notebook_config.py` — `CHART_MODULE_MAP` |

---

## File 1: config/settings.py — Core Application Settings

**Full path:** `config/settings.py`

This is the **single source of truth** for all backend configuration. Every page, component, and data module imports from here — no file other than this one should ever call `os.getenv()` for application-level settings.

### Databricks Connection Settings

These five settings control how the app connects to your Databricks workspace and queries system tables.

---

#### `DATABRICKS_HOST`

```python
DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "https://your-workspace.cloud.databricks.com")
```

**What it does:** The base URL of your Databricks workspace. Used by `data/db.py` to construct the SQL connector's `server_hostname`.

**How to find it:** When you log into Databricks, the browser URL bar shows your workspace URL: `https://your-workspace-id.cloud.databricks.com/`. That full URL (with the trailing slash or without) is your `DATABRICKS_HOST`.

**When to change it:** Change the default value when setting up for local development with a different workspace. In Databricks Apps production, this value is **auto-injected by the runtime** — you do not need to set it in `app.yaml`.

**Format:** Always include `https://`. Trailing slash is handled automatically by the code (`DATABRICKS_HOST.rstrip('/')`).

---

#### `DATABRICKS_WAREHOUSE_ID`

```python
DATABRICKS_WAREHOUSE_ID = os.getenv("DATABRICKS_WAREHOUSE_ID", "your_sql_warehouse_id")
```

**What it does:** The ID of the SQL Warehouse used to execute ALL system table queries. Every dashboard section, every KPI card, every chart runs through this warehouse.

**How to find it:**
1. Databricks sidebar → **SQL Warehouses**
2. Click your warehouse → **Connection Details** tab
3. Find the **HTTP Path**: `/sql/1.0/warehouses/YOUR_WAREHOUSE_ID`
4. The Warehouse ID is the alphanumeric string at the end: `your_sql_warehouse_id`

**When to change it:** This is **the most important setting to change** — both for local development and in `app.yaml` for production. If this is wrong or empty, all dashboards show "No data available".

**In `app.yaml`:**
```yaml
- name: DATABRICKS_WAREHOUSE_ID
  value: "abc123def456789"
```

---

#### `DATABRICKS_TOKEN`

```python
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "dapi_your_personal_access_token_here")
```

**What it does:** A Personal Access Token (PAT) used to authenticate with Databricks when running locally.

**How to generate one:**
1. Databricks → click your username (top-right) → **Settings**
2. Go to **Developer** → **Access tokens**
3. Click **Generate new token** → give it a name and expiry → copy it

**When to change it:** Update the default value for local development. **Do NOT add this to `app.yaml`** — in Databricks Apps, OAuth authentication is injected automatically and this field is ignored by the runtime.

⚠️ **Security Warning:** Never commit a real PAT to Git. If this file is tracked by Git, consider using a shell environment variable instead:
```bash
# Set in your terminal before running
export DATABRICKS_TOKEN="dapi..."
streamlit run app.py
```

---

#### `DATABRICKS_CLIENT_ID`

```python
DATABRICKS_CLIENT_ID = os.getenv("DATABRICKS_CLIENT_ID", "")
```

**What it does:** The Client ID (also known as Application ID) of a Databricks Service Principal used for OAuth Machine-to-Machine (M2M) authentication.

**When to change it:** Update this variable along with `DATABRICKS_CLIENT_SECRET` to connect using a Service Principal instead of a Personal Access Token (PAT). If both are set, OAuth M2M authentication takes precedence over `DATABRICKS_TOKEN`.

---

#### `DATABRICKS_CLIENT_SECRET`

```python
DATABRICKS_CLIENT_SECRET = os.getenv("DATABRICKS_CLIENT_SECRET", "")
```

**What it does:** The Client Secret of the Databricks Service Principal used for OAuth Machine-to-Machine (M2M) authentication.

**When to change it:** Update this variable along with `DATABRICKS_CLIENT_ID` to authenticate via a Service Principal.

⚠️ **Security Warning:** Never commit a real Service Principal Client Secret to Git. If this file is tracked by Git, consider using a shell environment variable or a local `.env` file instead.

---

#### `DATABRICKS_CATALOG`

```python
DATABRICKS_CATALOG = os.getenv("DATABRICKS_CATALOG", "system")
```

**What it does:** The Unity Catalog catalog where Databricks System Tables live. All SQL queries in `data/queries/` reference tables in the format `{catalog}.billing.usage`, `{catalog}.query.history`, etc.

**When to change it:** Leave as `"system"` unless your admin has mirrored the system tables to a different catalog (some organizations do this for access control reasons). If you change this, all queries will automatically point to the new catalog.

---

#### `DATABRICKS_QUERY_TIMEOUT_SECONDS`

```python
DATABRICKS_QUERY_TIMEOUT_SECONDS = int(os.getenv("DATABRICKS_QUERY_TIMEOUT", "60"))
```

**What it does:** Maximum number of seconds a single SQL query can run before being cancelled. If a dashboard section is timing out, increase this value.

**Recommended values:** `60` for fast Serverless warehouses · `120` for Pro warehouses · `180` for large workspaces with years of billing history

---

#### `DATABRICKS_CACHE_TTL_SECONDS`

```python
DATABRICKS_CACHE_TTL_SECONDS = int(os.getenv("DATABRICKS_CACHE_TTL", "7200"))
```

**What it does:** How long (in seconds) dashboard data is cached in Streamlit's `@st.cache_data` before being re-fetched from the warehouse. Default is 7,200 seconds (2 hours).

**Trade-off:**
- Lower TTL (e.g., `900` = 15 min) → fresher data, more warehouse queries, higher compute cost
- Higher TTL (e.g., `14400` = 4 hours) → less warehouse usage, but data may lag

**In `app.yaml`:**
```yaml
- name: DATABRICKS_CACHE_TTL
  value: "3600"    # 1 hour
```

---

### Notebook Reference Settings

These settings control the Databricks notebook that is linked throughout the dashboards. The notebook (`FinOps_Databricks_FullDemo_v5-5`) is a curated library of 20 optimization modules with runnable code. The intelligence panels in the app construct deep-link URLs that send users directly to the relevant cell in this notebook.

---

#### `NOTEBOOK_NAME`

```python
NOTEBOOK_NAME = os.getenv("NOTEBOOK_NAME", "FinOps DBX Developer Notebook")
```

**What it does:** The display name shown in the sidebar notebook link footer.

**When to change it:** Update if you want to display a different label for the companion notebook in the left sidebar.

---

#### `NOTEBOOK_BTN_LABEL`

```python
NOTEBOOK_BTN_LABEL = os.getenv("NOTEBOOK_BTN_LABEL", "Open Developer Notebook")
```

**What it does:** The display name shown in the global header's notebook link button in the top right corner.

**When to change it:** Update if you want to change the text on the "📓 Open Notebook" button in the top right corner.

---

#### `NOTEBOOK_ID`

```python
NOTEBOOK_ID = os.getenv("NOTEBOOK_ID", "1561959874304159")
```

**What it does:** The numeric identifier for the Databricks notebook. Used to construct deep-link URLs in the format:
```
https://your-workspace.cloud.databricks.com/#notebook/{NOTEBOOK_ID}/command/{CELL_ID}
```

**How to find your notebook's ID:**
1. Open the notebook in your Databricks workspace
2. Look at the browser URL bar — it will look like:  
   `https://workspace.cloud.databricks.com/#notebook/1561959874304159/command/...`
3. The number after `#notebook/` and before `/command/` is your `NOTEBOOK_ID`
4. In this example: `1561959874304159`

**What happens if it's empty (`""`):** The `notebook_cell_url()` and `notebook_base_url()` helper functions fall back to a Databricks public demo URL (`_FALLBACK_NOTEBOOK_URL`). The app still runs — only the "📡 Analyze" deep-link buttons are affected.

---

#### `NOTEBOOK_WORKSPACE_PATH`

```python
NOTEBOOK_WORKSPACE_PATH = os.getenv(
    "NOTEBOOK_WORKSPACE_PATH",
    "/Workspace/Users/pm240209@gmail.com/Hoonartek/FinOps_Databricks_FullDemo_v5-5"
)
```

**What it does:** The full workspace filesystem path to the notebook. Used as an alternative URL construction method and for display purposes.

**When to change it:** Update the path to match where your copy of the notebook lives in your workspace. The path can be found in the Databricks Workspace browser → right-click the notebook → "Copy path".

---

### LLM Provider Settings

The app supports three AI providers for the intelligence analysis panels and ClusterDNA recommendations. Only one provider is active at a time, controlled by `LLM_PROVIDER`.

---

#### `LLM_PROVIDER`

```python
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
```

**What it does:** Tells the app which AI provider to use. The `llm_is_configured()` helper checks this value and the corresponding API key to determine whether AI features should be enabled.

**Valid values:**
- `"gemini"` — Google Gemini (default — `google-genai` package used)
- `"anthropic"` — Anthropic Claude (`anthropic` package used)
- `"openai"` — OpenAI GPT-4o (`openai` package used)
- `"disabled"` — Disables all AI features without error

**In `app.yaml`:**
```yaml
- name: LLM_PROVIDER
  value: "anthropic"
```

---

#### `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`

```python
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", os.getenv("DATABRICKS_SECRET_anthropic_api_key", ""))
ANTHROPIC_MODEL   = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
```

**What `ANTHROPIC_API_KEY` does:** API key for authenticating with the Anthropic API. When `LLM_PROVIDER = "anthropic"`, this key is used for all AI analysis panel requests.

Note the double `os.getenv()` fallback: the app checks for `ANTHROPIC_API_KEY` first, then `DATABRICKS_SECRET_anthropic_api_key` (the format Databricks Secrets uses when injecting values). This ensures compatibility with both local development and Databricks Apps deployment.

**What `ANTHROPIC_MODEL` does:** Which Claude model version to call. `claude-sonnet-4-5` is the default (high capability, reasonable cost). Other options: `claude-opus-4-5` (highest quality), `claude-haiku-3-5` (fastest, cheapest).

**In `app.yaml` secrets section:**
```yaml
secrets:
  - key: ANTHROPIC_API_KEY
    scope: finops-copilot
```

---

#### `OPENAI_API_KEY` / `OPENAI_MODEL`

```python
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o")
```

**What they do:** API key and model version for OpenAI. Used when `LLM_PROVIDER = "openai"`. `gpt-4o` is the default (multimodal, high performance). Other options: `gpt-4o-mini` (faster, cheaper).

---

#### `GEMINI_API_KEY` / `GEMINI_MODEL`

```python
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSy...")
GEMINI_MODEL   = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")
```

**What they do:** API key and model version for Google Gemini. Used when `LLM_PROVIDER = "gemini"`. Also used by the ClusterDNA analysis panels in the main app (separate from `log_processor_settings.py` which controls the Log Analyzer page).

**Note on two Gemini keys:** There are two places where a Gemini key appears:
1. `config/settings.py` — for the Command Centre's "🔍 Analyze Issues" panels
2. `log_processor/log_processor_settings.py` — for the Log Analyzer's ClusterDNA AI engine

Both can use the same key. They're kept separate so the `log_processor/` package can be used independently.

---

#### `llm_is_configured()` helper

```python
def llm_is_configured() -> bool:
    """True if an LLM API key is available for the selected provider."""
    if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
        return True
    if LLM_PROVIDER == "openai"    and OPENAI_API_KEY:
        return True
    if LLM_PROVIDER == "gemini"    and GEMINI_API_KEY:
        return True
    return False
```

**Usage:** Call this before attempting any AI feature to avoid runtime errors:
```python
from config.settings import llm_is_configured
if llm_is_configured():
    # safe to call AI features
```

---

### App Behaviour Settings

---

#### `APP_TITLE`, `APP_SUBTITLE`, `APP_ICON`

```python
APP_TITLE    = "FinOps Command Center"
APP_SUBTITLE = "Databricks Cost Intelligence · Proactive Insights"
APP_ICON     = "⚡"
```

**What they do:** `APP_TITLE` sets the browser tab title (via `st.set_page_config`). `APP_ICON` sets the favicon emoji. `APP_SUBTITLE` is used in displays.

**When to change them:** If you want to white-label the app with your company name, update these values.

---

#### `DEFAULT_THEME`

```python
DEFAULT_THEME = os.getenv("DEFAULT_THEME", "dark")
```

**What it does:** Controls the theme (color scheme) when a user opens the app for the first time. Options: `"dark"` or `"light"`.

**How theme toggle works:** The user can switch themes at any time using the ☀️/🌙 button in the top-right header. Their choice is stored in `st.session_state.theme` for the duration of their browser session. This setting only controls the **initial default** — it does not lock the theme.

---

### Helper Functions Exported by settings.py

These two functions are used throughout the app and are imported directly by component files.

---

#### `notebook_cell_url(cell_id: int) -> str`

Constructs a deep-link URL to a specific cell in the reference notebook.

```python
def notebook_cell_url(cell_id: int) -> str:
    if DATABRICKS_HOST and NOTEBOOK_ID:
        return f"{DATABRICKS_HOST.rstrip('/')}/#notebook/{NOTEBOOK_ID}/command/{cell_id}"
    return f"{_FALLBACK_NOTEBOOK_URL}#command/{cell_id}"
```

**How it's used:** Called by `components/right_panel.py` and `components/analyze_panel.py` to generate the "Open in Notebook" button URLs for each optimization module.

**Example:**
```python
from config.settings import notebook_cell_url
url = notebook_cell_url(1561959874304175)
# Returns: "https://workspace.cloud.databricks.com/#notebook/1561959874304159/command/1561959874304175"
```

When `NOTEBOOK_ID` is empty, falls back to: `https://databricks-prod-cloudfront.../notebook/0/dashboard#command/1561959874304175`

---

#### `notebook_base_url() -> str`

Returns the URL to open the notebook from its beginning. Used in the sidebar and global header "Open Notebook" button.

```python
def notebook_base_url() -> str:
    if DATABRICKS_HOST and NOTEBOOK_ID:
        return f"{DATABRICKS_HOST.rstrip('/')}/#notebook/{NOTEBOOK_ID}"
    return _FALLBACK_NOTEBOOK_URL
```

---

## File 2: log_processor/log_processor_settings.py — ClusterDNA Settings

**Full path:** `log_processor/log_processor_settings.py`

This is a deliberately minimal, separate settings file for the Log Processor engine. It exists separately from `config/settings.py` so the `log_processor/` package can be imported and run **completely independently** of the Streamlit app — for example, in a Databricks notebook, a standalone Python script, or an automated pipeline health check.

```python
# log_processor/log_processor_settings.py

GEMINI_API_KEY = "your-gemini-api-key-here"
# This is the API key used ONLY by the ClusterDNA AI Engine (log_processor/ai_engine.py).
# It may be the same key as in config/settings.py, or a different one.
# Get a free key: https://aistudio.google.com/app/apikey

GEMINI_MODEL = "gemini-2.0-flash"
# The model used for ClusterDNA right-sizing recommendations.
# Options:
#   "gemini-2.0-flash"    — fastest, most cost-effective (recommended for ClusterDNA)
#   "gemini-1.5-pro"      — higher quality analysis, slower and more expensive
#   "gemini-3-flash-preview" — preview model (may not be stable)
```

**What to change here:**
- `GEMINI_API_KEY` — Replace with your actual key for the Log Analyzer to generate AI recommendations
- `GEMINI_MODEL` — Change the model version if you want more detailed analysis (`gemini-1.5-pro`) or faster responses (`gemini-2.0-flash`)

**In production (Databricks Apps):** You can inject these via environment variables too. Add to `app.yaml`:
```yaml
- name: GEMINI_API_KEY_LOG    # Use a different env var name if needed
  scope: finops-copilot
```
Then update `log_processor_settings.py` to read from environment:
```python
import os
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "your-fallback-key")
```

---

## File 3: app.yaml — Production Deployment Overrides

**Full path:** `app.yaml` (project root)

`app.yaml` is the **Databricks Apps deployment manifest**. It is NOT a Python file — it's read directly by the Databricks Apps runtime when you run `databricks apps deploy`. It defines the startup command, non-secret environment variables, and which Databricks Secrets to inject.

> **Key principle:** `app.yaml` overrides `config/settings.py` for every variable that shares an environment variable name. Think of `settings.py` as the local default and `app.yaml` as the production override.

```yaml
# app.yaml — Databricks Apps Deployment Configuration
command: "python -m streamlit run app.py --server.port 8080"

env:
  #
  # NON-SECRET ENVIRONMENT VARIABLES
  # These are visible to anyone who can read this file.
  # Never put API keys, passwords, or tokens here.
  #
  - name: DATABRICKS_WAREHOUSE_ID
    value: "your_warehouse_id_here"

  - name: NOTEBOOK_NAME
    value: "FinOps_Databricks_FullDemo_v5-5"

  - name: NOTEBOOK_ID
    value: ""     # Fill in your numeric notebook ID for deep-link functionality

  - name: DEFAULT_THEME
    value: "dark"

  - name: FORCE_DEMO_MODE
    value: "false"

secrets:
  #
  # SECRET KEYS — pulled from Databricks Secrets at deployment time
  # Only uncomment the provider(s) you have configured.
  # The "key" must exactly match what you stored with:
  #   databricks secrets put-secret --scope finops-copilot --key KEY_NAME
  #
  - key: ANTHROPIC_API_KEY
    scope: finops-copilot
  # - key: GEMINI_API_KEY
  #   scope: finops-copilot
  # - key: OPENAI_API_KEY
  #   scope: finops-copilot
```

**Settings intentionally absent from `app.yaml`:**

| Setting | Why It's Not In app.yaml |
|---|---|
| `DATABRICKS_HOST` | Auto-injected by the Databricks Apps runtime |
| `DATABRICKS_TOKEN` | Not used in Databricks Apps — OAuth replaces it |
| `NOTEBOOK_FIRST_CELL_ID`, `NOTEBOOK_LAST_CELL_ID`, `NOTEBOOK_TOTAL_CELLS` | These were removed from the codebase — all cell routing is now dynamic via `config/notebook_config.py` |

---

## File 4: config/notebook_config.py — Intelligence Routing Maps

**Full path:** `config/notebook_config.py`

This file is the brain behind the "📡 Analyze" intelligence panels. It contains four data structures that define **exactly which optimization modules are relevant to which dashboards, issues, and charts** — and provides the Databricks notebook cell IDs needed to deep-link to the right section.

### MODULE_CELLS — The 20 Optimization Modules

Maps module numbers (0–19) to their entry cell ID in the `FinOps_Databricks_FullDemo_v5-5` notebook. Each module has a name, an `intro` cell ID, and a list of keyword `tags` used for fuzzy matching.

```python
MODULE_CELLS = {
    0:  {"name": "Setup",                       "intro": 1561959874304162,  "tags": ["setup","schema","tables"]},
    1:  {"name": "Caching — 3 Layers",          "intro": 1561959874304175,  "tags": ["cache","result cache","disk cache","sql warehouse"]},
    2:  {"name": "Partitioning",                "intro": 1561959874304184,  "tags": ["partition","scan","filter","date filter"]},
    3:  {"name": "VACUUM + OPTIMIZE",           "intro": 7812751700684417,  "tags": ["vacuum","optimize","zombie files","small files","storage"]},
    4:  {"name": "Narrow vs Wide Transforms",   "intro": 1561959874304211,  "tags": ["shuffle","exchange","transform","repartition"]},
    5:  {"name": "Task & Job Observability",    "intro": 1561959874304219,  "tags": ["spark ui","job","stage","task","observability"]},
    6:  {"name": "Z-Order",                     "intro": 1561959874304226,  "tags": ["z-order","file skip","data skipping","high cardinality"]},
    7:  {"name": "AQE",                         "intro": 1561959874304236,  "tags": ["aqe","adaptive","skew","broadcast threshold"]},
    8:  {"name": "Broadcast Join",              "intro": 1561959874304243,  "tags": ["broadcast","join","sort merge join"]},
    9:  {"name": "All 4 Join Types",            "intro": 1561959874304250,  "tags": ["join type","smj","shj","nlj"]},
    10: {"name": "Liquid Clustering",           "intro": 1561959874304260,  "tags": ["liquid clustering","merge","cdc","incremental"]},
    11: {"name": "Data Spill & Skew",           "intro": 1561959874304272,  "tags": ["spill","skew","oom","out of memory","hot key"]},
    12: {"name": "PySpark Optimized Writes",    "intro": 1561959874304280,  "tags": ["write","pyspark","output","write layout"]},
    13: {"name": "Zombie Files",                "intro": 1561959874304289,  "tags": ["zombie","orphan","storage waste","file cleanup"]},
    14: {"name": "Dashboard $18K/Month",        "intro": 1561959874304301,  "tags": ["materialized view","mv","pre-aggregate","repeat query"]},
    15: {"name": "Warehouse Saturation",        "intro": 1561959874304311,  "tags": ["warehouse","queue","saturation","max clusters"]},
    16: {"name": "MERGE INTO Degradation",      "intro": 1561959874304320,  "tags": ["merge","merge into","upsert","pipeline cost"]},
    17: {"name": "Time Travel & Retention",     "intro": 1561959874304327,  "tags": ["time travel","retention","vacuum retain","compliance"]},
    18: {"name": "System Tables Deep-Dive",     "intro": 1561959874304337,  "tags": ["system tables","billing","monitoring","cost attribution"]},
    19: {"name": "Right-Sizing & Cluster Config","intro": 1561959874304364, "tags": ["right-size","cluster config","instance type","tagging"]},
}
```

**Full Module Index:**

| # | Module Name | Key Problem Addressed |
|---|---|---|
| 0 | Setup | Environment, schema, Delta table setup patterns |
| 1 | Caching — 3 Layers | Result cache, disk cache, SQL Warehouse cache awareness |
| 2 | Partitioning | Partition scan reduction, date filter pushdown |
| 3 | VACUUM + OPTIMIZE | Dead file cleanup, file compaction, storage cost |
| 4 | Narrow vs Wide Transforms | Shuffle minimization, repartition strategies |
| 5 | Task & Job Observability | Spark UI interpretation, DAG analysis, stage profiling |
| 6 | Z-Order | Data skipping effectiveness, high-cardinality column ordering |
| 7 | AQE — Adaptive Query Execution | Skew joins, runtime plan adaptation, broadcast threshold tuning |
| 8 | Broadcast Join | When to broadcast, sort-merge vs broadcast decision |
| 9 | All 4 Join Types | SMJ, SHJ, NLJ, broadcast — when each applies |
| 10 | Liquid Clustering | Replacing Z-Order for CDC/incremental patterns, MERGE cost |
| 11 | Data Spill & Skew | OOM prevention, hot key handling, executor memory tuning |
| 12 | PySpark Optimized Writes | Output file size control, write partitioning |
| 13 | Zombie Files | Orphaned file detection, storage waste remediation |
| 14 | Dashboard $18K/Month | Materialized Views, pre-aggregation for repeat queries |
| 15 | Warehouse Saturation | Queue depth, autoscale configuration, max cluster sizing |
| 16 | MERGE INTO Degradation | MERGE cost trends, upsert anti-patterns, pipeline degradation |
| 17 | Time Travel & Retention | VACUUM RETAIN settings, compliance vs cost trade-offs |
| 18 | System Tables Deep-Dive | Billing attribution, cost monitoring, system table patterns |
| 19 | Right-Sizing & Cluster Config | Instance type selection, autoscale ranges, cluster tagging |

---

### DASHBOARD_MODULE_MAP — Dashboard → Modules

Maps each Command Centre dashboard section (by its internal key name) to an ordered list of module numbers. These are the modules shown in the "🔍 Analyze Issues" panel when a user clicks the button in that section's header. The order matters — modules are displayed left-to-right in priority order.

```python
DASHBOARD_MODULE_MAP = {
    "usage_overview":        [18, 19, 1, 14, 15],   # System tables → Right-sizing → Cache → MV → Saturation
    "all_purpose_compute":   [5, 4, 7, 8, 11],       # Observability → Transforms → AQE → Broadcast → Spill
    "jobs_compute":          [5, 16, 10, 11, 4],      # Observability → MERGE → LC → Spill → Transforms
    "sql_warehouse":         [1, 15, 14, 2, 6],       # Cache → Saturation → MV → Partition → Z-Order
    "delta_live_tables":     [3, 13, 10, 16, 12],     # VACUUM → Zombie → LC → MERGE → Writes
    "storage_health":        [3, 13, 2, 6, 17],       # VACUUM → Zombie → Partition → Z-Order → Retention
    "chargeback":            [19, 18, 12, 3, 17],     # Right-size → System tables → Writes → VACUUM → Retention
    "model_serving":         [5, 19, 18],             # Observability → Right-size → System tables
    "query_intelligence":    [1, 2, 4, 6, 7, 8, 9, 11, 14], # All query performance modules
    "merge_health":          [3, 10, 12, 16],         # VACUUM → LC → Writes → MERGE
}
```

---

### ISSUE_ROUTING — Issue Signals → Modules

When specific cost metrics breach thresholds (computed live by `command_centre.py`), these signals are passed to the intelligence panels. `ISSUE_ROUTING` maps **signal names** to the most targeted modules and a severity level.

```python
ISSUE_ROUTING = {
    "cache_hit_low":       {"modules": [1, 14],      "severity": "high"},
    "queries_queued":      {"modules": [15, 1],      "severity": "high"},
    "warehouse_p90_high":  {"modules": [15, 2, 6],   "severity": "medium"},
    "failed_queries":      {"modules": [5, 15],      "severity": "high"},
    "job_cost_spike":      {"modules": [5, 16, 10],  "severity": "critical"},
    "merge_slow":          {"modules": [10, 16],     "severity": "high"},
    "zombie_files":        {"modules": [13, 3],      "severity": "medium"},
    "vacuum_overdue":      {"modules": [3, 17],      "severity": "medium"},
    "small_files":         {"modules": [3, 2, 12],   "severity": "medium"},
    "untagged_clusters":   {"modules": [19, 18],     "severity": "high"},
    "data_skew":           {"modules": [11, 7],      "severity": "high"},
    "high_gb_scanned":     {"modules": [2, 6, 1],    "severity": "medium"},
    "shuffle_bottleneck":  {"modules": [4, 8, 7],    "severity": "medium"},
    "cost_anomaly":        {"modules": [18, 5],      "severity": "critical"},
    "repeat_queries":      {"modules": [14, 1],      "severity": "medium"},
    "storage_growth":      {"modules": [3, 13, 2],   "severity": "medium"},
    "dlt_backpressure":    {"modules": [3, 10, 16],  "severity": "high"},
    "all_purpose_high":    {"modules": [5, 4, 19],   "severity": "high"},
    "data_spill":          {"modules": [11, 7],      "severity": "critical"},
    "cache_breaker":       {"modules": [1, 14],      "severity": "high"},
    "write_amplification": {"modules": [16, 10, 12], "severity": "high"},
    "warehouse_idle":      {"modules": [15, 19],     "severity": "medium"},
    "vacuum_retain0":      {"modules": [17, 3],      "severity": "critical"},
}
```

**Severity levels and their meaning:**

| Severity | Meaning |
|---|---|
| `critical` | Immediate action required — likely causing significant cost or reliability impact now |
| `high` | Significant inefficiency detected — should be addressed this sprint |
| `medium` | Optimization opportunity — address in next planning cycle |
| `low` | Minor improvement possible — batch with other low-effort tasks |

---

### CHART_MODULE_MAP — Per-Chart Module Deep Links

The most granular mapping. Every individual chart in the Command Centre has a unique key. When a user clicks the **📡** button on that chart, the app looks up the chart key here, retrieves the `default_modules` list, and renders the intelligence panel showing those modules.

The `metrics` field lists which live metric values from that chart are passed to the intelligence panel for contextual analysis.

```python
CHART_MODULE_MAP = {
    # ── SQL Warehouses ────────────────────────────────────────────────────────
    "wh_health_table": {
        "metrics":         ["cache_hit_pct", "queued_count", "p90_duration_s", "failed_count"],
        "default_modules": [1, 15, 14]          # Cache → Saturation → Materialized Views
    },
    "cache_trend": {
        "metrics":         ["cache_hit_pct"],
        "default_modules": [1, 14]              # Cache → MV (if cache low, queries may be uncacheable)
    },
    "hourly_heatmap": {
        "metrics":         ["queued_count", "p90_duration_s"],
        "default_modules": [15, 2]              # Saturation → Partitioning (queue = warehouse undersized)
    },
    "top_queries": {
        "metrics":         ["total_gb_scanned", "p90_duration_s"],
        "default_modules": [2, 6]               # Partition → Z-Order (GB scan = poor data layout)
    },

    # ── Jobs ─────────────────────────────────────────────────────────────────
    "job_8week_trend": {
        "metrics":         ["cost_trend_pct"],
        "default_modules": [16, 10, 5]          # MERGE degradation → LC → Observability
    },
    "job_failed_cost": {
        "metrics":         ["wow_pct_change"],
        "default_modules": [5, 11]              # Observability → Spill (failed jobs = OOM or spill)
    },

    # ── Query Intelligence ────────────────────────────────────────────────────
    "spill_events_bar": {
        "metrics":         ["spill_query_count", "avg_spill_pct"],
        "default_modules": [11, 7, 4]           # Spill → AQE → Transforms
    },
    "repeat_query_scatter": {
        "metrics":         ["mv_candidate_count", "cache_breaker_queries"],
        "default_modules": [14, 1, 2]           # MV → Cache → Partition
    },
    "shuffle_ratio_line": {
        "metrics":         ["avg_shuffle_ratio"],
        "default_modules": [4, 8, 9]            # Transforms → Broadcast → All join types
    },

    # ── Storage ───────────────────────────────────────────────────────────────
    "vacuum_compliance": {
        "metrics":         ["critical_tables", "days_since_vacuum"],
        "default_modules": [3, 17]              # VACUUM → Retention
    },
    "storage_cost_area": {
        "metrics":         ["zombie_risk_high_count", "days_since_vacuum"],
        "default_modules": [3, 13]              # VACUUM → Zombie files
    },

    # ── (full map in notebook_config.py — 35+ entries total)
}
```

---

### How to Update a Notebook Cell ID

If you replace the linked notebook with a newer version, or copy it to a different workspace, the cell IDs will change. Here's how to update them:

**Step 1:** Open the notebook in Databricks

**Step 2:** Navigate to the module heading cell you want to link (e.g., the cell that starts **## MODULE 1 — Caching**)

**Step 3:** Look at the browser URL:
```
https://your-workspace.cloud.databricks.com/#notebook/1561959874304159/command/1561959874304175
                                                                                 ↑
                                                                          This is the CELL_ID
```

**Step 4:** Open `config/notebook_config.py` and update the `intro` value for that module:
```python
MODULE_CELLS = {
    1: {"name": "Caching — 3 Layers", "intro": YOUR_NEW_CELL_ID, "tags": [...]},
    ...
}
```

**Step 5:** Save the file. No restart needed for local dev — Streamlit hot-reloads. For Databricks Apps, redeploy with `databricks apps deploy`.

---

## Cache Architecture — Isolated Query Buckets

All Databricks queries flow through `data/db.py`. Streamlit's `@st.cache_data` decorator caches each function's result for `DATABRICKS_CACHE_TTL_SECONDS` (default 2 hours).

The key design decision is that **each dashboard section has its own isolated cache function**. This means when you click "🔄 Refresh" on the Jobs dashboard, only the job query functions are re-called — the SQL Warehouse cache, Storage cache, and all other sections are untouched.

### The 10 Cache Buckets

| Cache Function | Used By Dashboard Section | What It Caches |
|---|---|---|
| `run_query()` | Shared / internal utils | Generic queries not tied to a specific section |
| `run_query_overall()` | Overall tab + Home forecast | MTD spend, 90-day trend, anomaly detection, workspace forecast |
| `run_query_interactive()` | Interactive Compute | Classic cluster costs, serverless session costs |
| `run_query_sql_wh()` | SQL Warehouse | Cache hit rate, query history, queue depth, P90 latency |
| `run_query_jobs()` | Jobs Compute | Top jobs, classic/serverless job costs, failed run waste |
| `run_query_dlt()` | Delta Live Tables | DLT pipeline costs, run health, expectation violations |
| `run_query_storage()` | Storage Health | Zombie file risk, vacuum compliance, table sizes |
| `run_query_chargeback()` | Chargeback | Team spend attribution, tag coverage |
| `run_query_qi()` | Query Intelligence | Spill events, shuffle ratios, repeat query patterns |
| `run_query_merge()` | MERGE & Clustering | MERGE cost trend, Liquid Clustering candidates, write amplification |

### How Section Refresh Works

When a user clicks **"🔄 Refresh"** on, say, the SQL Warehouse section:
1. `_clear_section_cache([run_query_sql_wh])` is called (in `command_centre.py`)
2. Only `run_query_sql_wh.clear()` is invoked — no other buckets are touched
3. The page reruns → only the SQL Warehouse queries are re-executed
4. A toast notification appears: "Dashboards are refreshed!"

When a user clicks **"🔄 Refresh Data"** in the **sidebar**:
1. `refresh_all_caches()` is called (in `data/db.py`)
2. `st.cache_data.clear()` wipes ALL cached results across ALL 10 buckets
3. All data functions are immediately pre-called (pre-warming) to populate the cache before the user sees anything
4. This prevents the "loading spinner appearing for each section one by one" experience

---

## Theme System — Dark and Light Mode

The app supports full dark/light mode. The theme state flows as follows:

```
config/settings.py (DEFAULT_THEME)
         ↓ initializes
st.session_state.theme  ("dark" or "light")
         ↓ read by
components/styles.py → get_theme_colours()
         ↓ returns
Dict of color tokens used throughout all pages and components
```

### How to Use Theme Colors in a New Component

```python
from components.styles import get_theme_colours

def render():
    c = get_theme_colours()   # Call INSIDE render(), not at module level
    
    st.markdown(
        f'<div style="color:{c["text_hi"]}; background:{c["surface"]};">My content</div>',
        unsafe_allow_html=True
    )
```

### Color Token Reference

| Token | Dark Value | Light Value | Use For |
|---|---|---|---|
| `bg` | `#0d1117` | `#f8f9fa` | Main page background |
| `surface` | `#161b22` | `#ffffff` | Card and panel backgrounds |
| `surface2` | `#1c2430` | `#f1f3f5` | Nested cards, secondary panels |
| `border` | `#21262d` | `#dee2e6` | Borders, dividers, table lines |
| `text_hi` | `#e6edf3` | `#212529` | Primary text (headings, values) |
| `text_mid` | `#b1bac4` | `#495057` | Secondary text (labels) |
| `text_lo` | `#8b949e` | `#6c757d` | Tertiary text (timestamps, subtitles) |
| `cyan` | `#00c0f2` | `#0891b2` | Primary accent, links, highlights |
| `cyan_dim` | `#005a80` | `#bae6fd` | Subtle cyan (info icons borders) |
| `green` | `#1abc9c` | `#16a34a` | Positive / healthy state |
| `amber` | `#ffa100` | `#d97706` | Warning state |
| `red` | `#ff4b4b` | `#dc2626` | Critical / negative state |
| `purple` | `#a78bfa` | `#7c3aed` | SQL Warehouse section accent |
| `chart_bg` | `#0d1117` | `#ffffff` | Plotly chart background |

---

## Adding a New Configuration Variable — The Correct Pattern

When you need to add a new setting (e.g., a new query timeout, a feature flag, a new API endpoint), follow this exact pattern:

### Step 1: Add to `config/settings.py` with `os.getenv()`

```python
# config/settings.py
MY_NEW_SETTING = os.getenv("MY_NEW_SETTING", "default_value_for_local_dev")
```

The `os.getenv("ENV_VAR_NAME", "fallback")` pattern is mandatory — it's what makes the local/production override system work.

### Step 2: Import and use it in your module

```python
# In any page, component, or data file
from config.settings import MY_NEW_SETTING

# Use it
if MY_NEW_SETTING == "some_value":
    ...
```

**Never** call `os.getenv()` directly in page or component files. Always go through `config/settings.py`.

### Step 3: If non-secret — add to `app.yaml` env section

```yaml
# app.yaml
env:
  - name: MY_NEW_SETTING
    value: "production_value"
```

### Step 4: If it's a secret (API key, token) — use Databricks Secrets

```bash
# Store the secret
databricks secrets put-secret --scope finops-copilot --key MY_SECRET_KEY
```

```yaml
# app.yaml — secrets section
secrets:
  - key: MY_SECRET_KEY
    scope: finops-copilot
```

```python
# config/settings.py — read with double fallback
MY_SECRET_KEY = os.getenv("MY_SECRET_KEY", os.getenv("DATABRICKS_SECRET_my_secret_key", ""))
```

The double `os.getenv()` handles both the direct environment variable name and the format Databricks Secrets uses when injecting values into the process.

### Step 5: Document it in this file

Add the new variable to the appropriate section table in this document so future developers know about it.

---

## Network & Port Architecture — Local vs Production

To understand how the frontend and backend interact, here is a summary of the network and port architecture:

### Local Development Architecture

During local development, the application runs as two separate processes on `localhost` (loopback IP `127.0.0.1`):
* **Frontend (Vite Server)**: Runs on **`http://localhost:5173`**.
* **Backend (FastAPI Server)**: Runs on **`http://localhost:8601`**.

To prevent browser CORS blockages, Vite reverse-proxies all API requests:
* Any call to `/api/*` on `localhost:5173` is forwarded automatically to the backend on `localhost:8601` via settings in `frontend/vite.config.js`.
* CORS origins are set in `config/settings.py` to allow requests from the Vite port.

### Production Architecture (Databricks Apps)

When deployed to Databricks Apps, the frontend and backend are consolidated to run as a single service:
* **Process Host**: Binds to host **`0.0.0.0`** (all interfaces) on port **`8080`**.
* **Unified Serving**: The frontend is pre-built (`npm run build`) and outputted to `frontend/dist`. The FastAPI backend (`api/main.py`) mounts this directory as static files. All web traffic flows through the single port `8080`.
* **Public Domain**: The Databricks App runtime automatically provisions a secure, HTTPS URL (e.g., `https://your-app.databricksapps.com`) and routes incoming traffic to the container's port `8080`. CORS is not needed in production since frontend and backend share the exact same host origin.
