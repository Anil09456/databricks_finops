# 🚀 Deployment Guide — FinOps Copilot on Databricks Apps

> **Audience:** Platform engineers and DevOps teams responsible for deploying this application into a Databricks workspace.
>
> This guide covers every step required to go from source code to a live, production Databricks App — including infrastructure setup, secret management, `app.yaml` configuration, and post-deployment verification.

---

## 📋 Table of Contents

- [Understanding Databricks Apps](#understanding-databricks-apps)
- [How Configuration Works in Production vs Local](#how-configuration-works-in-production-vs-local)
- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Step 1 — Install and Configure the Databricks CLI](#step-1--install-and-configure-the-databricks-cli)
- [Step 2 — Enable System Tables in Your Workspace](#step-2--enable-system-tables-in-your-workspace)
- [Step 3 — Create or Identify a SQL Warehouse](#step-3--create-or-identify-a-sql-warehouse)
- [Step 4 — Set Up Databricks Secrets for LLM API Keys](#step-4--set-up-databricks-secrets-for-llm-api-keys)
- [Step 5 — Configure app.yaml](#step-5--configure-appyaml)
- [Step 6 — Deploy the Application](#step-6--deploy-the-application)
- [Step 7 — Post-Deployment Verification](#step-7--post-deployment-verification)
- [Granting Permissions to the App](#granting-permissions-to-the-app)
- [Updating the App After Code Changes](#updating-the-app-after-code-changes)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)
- [Deployment Architecture](#deployment-architecture)

---

## Understanding Databricks Apps

**Databricks Apps** is Databricks' native hosting platform for Streamlit (and other Python web) applications. It runs your application directly inside the Databricks cloud environment, which gives it several important properties:

### What Databricks Apps Does Automatically
- **Authentication** — Instead of requiring a Personal Access Token (PAT), the runtime injects a short-lived OAuth token and sets `DATABRICKS_HOST` automatically. The app gets workspace access without any hardcoded credentials.
- **Networking** — The app runs inside your Databricks VPC/VNet, so it can reach your SQL Warehouse and system tables without exposing them publicly.
- **SSL / Public URL** — Databricks provides a public HTTPS URL (`https://your-app-name.databricksapps.com`) with SSO protection — only authenticated members of your Databricks workspace can access it.
- **Process Management** — The runtime manages the Streamlit process lifecycle, restarts on crash, and handles scaling.

### What You Configure
- `DATABRICKS_WAREHOUSE_ID` — The specific SQL Warehouse to run queries against (not auto-detected)
- Non-secret settings (DBU price, theme, notebook reference) — via `app.yaml` env section
- Sensitive keys (LLM API keys) — via Databricks Secrets (injected as environment variables at runtime)

### The `app.yaml` File
`app.yaml` is the deployment manifest. It tells the Databricks Apps runtime:
1. **What command to run** — `python -m streamlit run app.py --server.port 8080`
2. **Which environment variables to inject** — non-secret config values
3. **Which Databricks Secrets to inject** — secret keys pulled from a Secrets scope at startup

The app's Python code reads all of these via `os.getenv()` in `config/settings.py`.

---

## How Configuration Works in Production vs Local

This table is critical to understand before you start. The same Python code runs in both environments — only where configuration comes from changes.

| Setting | Local Development | Databricks Apps (Production) |
|---|---|---|
| `DATABRICKS_HOST` | Hardcoded in `config/settings.py` | **Auto-injected** by the runtime |
| `DATABRICKS_TOKEN` | Hardcoded in `config/settings.py` | **Not used** — OAuth replaces it |
| `DATABRICKS_CLIENT_ID` | Hardcoded in `config/settings.py` or `.env` | Injected via `app.yaml` env section (optional) |
| `DATABRICKS_CLIENT_SECRET` | Hardcoded in `config/settings.py` or `.env` | Injected via Databricks Secrets → `app.yaml` secrets section (optional) |
| `DATABRICKS_WAREHOUSE_ID` | Hardcoded in `config/settings.py` | Injected via `app.yaml` env section |
| `NOTEBOOK_NAME` | Hardcoded in `config/settings.py` | Injected via `app.yaml` env section |
| `NOTEBOOK_BTN_LABEL` | Hardcoded in `config/settings.py` | Injected via `app.yaml` env section |
| `NOTEBOOK_ID` | Hardcoded in `config/settings.py` | Injected via `app.yaml` env section |
| `GEMINI_API_KEY` | Hardcoded in `log_processor/log_processor_settings.py` | Injected via Databricks Secrets → `app.yaml` secrets section |
| `ANTHROPIC_API_KEY` | Hardcoded in `config/settings.py` | Injected via Databricks Secrets → `app.yaml` secrets section |
| `DEFAULT_THEME` | Hardcoded in `config/settings.py` | Injected via `app.yaml` env section |

**The rule:** Edit `config/settings.py` and `log_processor/log_processor_settings.py` for **local development only**. For production, everything flows through `app.yaml`.

💡 **Note on Default Values Sync:** To keep options transparent for deployment engineers, all of the default values hardcoded in `config/settings.py` (like the default host, catalog, notebook ID, and paths) are also declared in the template `app.yaml` file. If you leave these values as-is in `app.yaml`, the app uses these default values. If you edit them, the edited values take precedence.

---

## Pre-Deployment Checklist

Complete every item before running the deploy command. Missing even one will cause the deployment to either fail or produce a non-functional app.

- [ ] Databricks CLI installed (v0.200 or higher) — `databricks --version`
- [ ] CLI authenticated against your target workspace — `databricks auth status`
- [ ] Unity Catalog enabled in the workspace
- [ ] System Tables enabled: `system.billing`, `system.query`, `system.storage` schemas accessible
- [ ] A running SQL Warehouse exists — you have its **Warehouse ID** (alphanumeric string)
- [ ] You know the **Notebook ID** of your reference notebook (or are comfortable deploying without deep links first)
- [ ] Databricks Secrets scope `finops-copilot` created (if using LLM features)
- [ ] LLM API key(s) stored in the secrets scope
- [ ] `requirements.txt` is up to date
- [ ] `app.yaml` has been edited with your actual values (not placeholder text)
- [ ] No real credentials are committed to your Git repository

---

## Step 1 — Install and Configure the Databricks CLI

The Databricks CLI is used to deploy the application and manage secrets.

### Install the CLI

```bash
# macOS — using Homebrew
brew tap databricks/tap
brew install databricks

# macOS / Linux — using curl
curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh

# Windows — using WinGet
winget install Databricks.DatabricksCLI

# Windows — using PowerShell (alternative)
iex "& { $(irm 'https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh') }"
```

### Verify the Installation

```bash
databricks --version
# Expected output: Databricks CLI v0.2xx.x
```

### Authenticate Against Your Workspace

```bash
databricks configure --host https://YOUR-WORKSPACE.cloud.databricks.com
```

When prompted, you have two options:

**Option A — Personal Access Token (for individuals):**
1. In Databricks, click your username (top-right) → **Settings**
2. Navigate to **Developer** → **Access tokens**
3. Click **Generate new token** → set a descriptive name and expiry → copy the token
4. Paste it at the CLI prompt

**Option B — OAuth (recommended for CI/CD pipelines):**
```bash
databricks auth login --host https://YOUR-WORKSPACE.cloud.databricks.com
# This opens a browser for SSO-based authentication — no token needed
```

### Verify Authentication

```bash
databricks auth status
# Should show: Host, Authentication type, User, and "✓ Authenticated"

databricks workspaces list
# Should list your workspace without error
```

---

## Step 2 — Enable System Tables in Your Workspace

System Tables are the backbone of all FinOps Copilot dashboards. They must be enabled by a **Metastore Admin** (typically a workspace admin or platform team lead).

### Check Current Status

In the Databricks SQL Editor, run:
```sql
-- Check which system schemas are enabled
SHOW SCHEMAS IN system;
```

You need at minimum these schemas to be present:
- `system.billing` — DBU billing data (charges all dashboards)
- `system.query` — SQL Warehouse query history (SQL Warehouse section)
- `system.storage` — Delta table metadata (Storage Health section)

### Enable System Tables (Metastore Admin Only)

1. Go to your Databricks workspace
2. Click **Catalog** in the left sidebar → select the `system` catalog
3. For each schema (`billing`, `query`, `storage`): click the schema → click **Enable**
4. Alternatively, use the REST API:

```bash
# Enable billing schema
curl -X PUT "https://YOUR-WORKSPACE.cloud.databricks.com/api/2.0/unity-catalog/metastores/{metastore_id}/systemschemas/billing" \
  -H "Authorization: Bearer $DATABRICKS_TOKEN" \
  -H "Content-Type: application/json"
```

### Verify Data is Flowing

```sql
-- Should return rows (may take 24h to backfill if newly enabled)
SELECT * FROM system.billing.usage LIMIT 5;

-- Check date range of available data
SELECT MIN(usage_date), MAX(usage_date) FROM system.billing.usage;
```

> **Important:** If just enabled, dashboards will show "No data available" while backfilling. This is expected and resolves within 24–48 hours. The app will function correctly — it shows informational messages rather than errors.

---

## Step 3 — Create or Identify a SQL Warehouse

The app uses a SQL Warehouse to execute all system table queries.

### Recommended Warehouse Settings

| Setting | Recommended Value | Reason |
|---|---|---|
| Type | Serverless | No cold start delay; auto-scales to zero when idle |
| Size | Small (2 DBU/hr) | Sufficient for FinOps dashboards; low cost |
| Auto-stop | 10 minutes | Prevents idle billing when dashboard is not in use |
| Channel | Current | Access to latest performance improvements |

### Find the Warehouse ID

1. Databricks sidebar → **SQL Warehouses**
2. Click your warehouse → **Connection Details** tab
3. The **HTTP Path** looks like: `/sql/1.0/warehouses/abc123def456789`
4. The **Warehouse ID** is everything after `/warehouses/`: `abc123def456789`
5. Copy this — you'll need it in `app.yaml`

### Grant Access to System Tables

The warehouse must have access to query System Tables. Run this in the SQL Editor as an admin:
```sql
-- Grant the warehouse's service principal read access to system catalog
GRANT USE CATALOG ON CATALOG system TO `warehouse-service-principal@your-workspace.com`;
GRANT USE SCHEMA ON SCHEMA system.billing TO `warehouse-service-principal@your-workspace.com`;
GRANT SELECT ON TABLE system.billing.usage TO `warehouse-service-principal@your-workspace.com`;
-- Repeat for system.query.history, system.storage.delta_tables
```

---

## Step 4 — Set Up Databricks Secrets for LLM API Keys

Secrets are **encrypted key-value pairs** stored in Databricks. Unlike environment variables, they are never visible in the `app.yaml` file or any source code — they're injected at runtime by the platform.

This step is **optional** if you don't need AI-powered recommendations, but is required for:
- The ClusterDNA "Generate AI Recommendations" button
- The "🔍 Analyze Issues" intelligence panels in the dashboards

### Create the Secrets Scope

A scope is a named container for a group of secrets. Create it once:

```bash
databricks secrets create-scope finops-copilot
```

Verify it was created:
```bash
databricks secrets list-scopes
# Should show: finops-copilot
```

### Add Your LLM API Key

Choose the provider you want to use and add its key:

**Google Gemini (recommended — most cost-effective):**
```bash
databricks secrets put-secret --scope finops-copilot --key GEMINI_API_KEY
# You'll be prompted to enter the key value. Get a key at: https://aistudio.google.com/app/apikey
```

**Anthropic Claude:**
```bash
databricks secrets put-secret --scope finops-copilot --key ANTHROPIC_API_KEY
# Get a key at: https://console.anthropic.com/settings/keys
```

**OpenAI:**
```bash
databricks secrets put-secret --scope finops-copilot --key OPENAI_API_KEY
# Get a key at: https://platform.openai.com/api-keys
```

### Verify the Secrets Are Stored

```bash
databricks secrets list-secrets finops-copilot
# Shows key names (NOT their values — secrets are never shown in plaintext)
```

### How Secrets Flow Into the App

In `app.yaml`, the `secrets:` section tells the runtime which secrets to fetch and inject:
```yaml
secrets:
  - key: ANTHROPIC_API_KEY      # The key name in Databricks Secrets
    scope: finops-copilot        # The scope that contains it
```

At startup, the runtime fetches the secret and injects it as an environment variable. `config/settings.py` then reads it with:
```python
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", os.getenv("DATABRICKS_SECRET_anthropic_api_key", ""))
```

---

## Step 5 — Configure app.yaml

`app.yaml` is located at the **root of the project**. Open it and fill in your actual values. This is the only file you need to edit for a Databricks Apps deployment.

Here is the complete file with every field explained:

```yaml
# app.yaml — Databricks Apps Deployment Configuration
# Deploy with: databricks apps deploy --source-code-path . finops-command-center

# The startup command. Port 8080 is required by Databricks Apps (do not change).
command: "python -m streamlit run app.py --server.port 8080"

env:
  # ─────────────────────────────────────────────────────────────────────────────
  # REQUIRED: Your SQL Warehouse ID
  # This is the ONLY setting that is guaranteed unique to your workspace.
  # Without this, all dashboards will show "No data available".
  # ─────────────────────────────────────────────────────────────────────────────
  - name: DATABRICKS_WAREHOUSE_ID
    value: "abc123def456789"   # ← Replace with your actual Warehouse ID

  # ─────────────────────────────────────────────────────────────────────────────
  # NOTEBOOK REFERENCE — Powers the deep-link buttons in analysis panels
  #
  # NOTEBOOK_NAME: Display name shown in the sidebar notebook link.
  # Can be left as-is if your notebook has the same name.
  #
  # NOTEBOOK_ID: The numeric ID from the Databricks notebook URL.
  # How to find it: Open the notebook → look at the browser URL:
  #   https://your-workspace.cloud.databricks.com/#notebook/1561959874304159/command/...
  #   The number after #notebook/ is your NOTEBOOK_ID: 1561959874304159
  #
  # If NOTEBOOK_ID is left empty (""), the "📡 Analyze" and "Open Notebook" buttons
  # will fall back to a public Databricks demo URL. The rest of the app works normally.
  # ─────────────────────────────────────────────────────────────────────────────
  - name: NOTEBOOK_NAME
    value: "FinOps_Databricks_FullDemo_v5-5"
  - name: NOTEBOOK_ID
    value: "1561959874304159"   # ← Replace with your notebook's numeric ID (or leave "" to disable)

  - name: DEFAULT_THEME
    value: "dark"        # Starting theme: "dark" or "light"
                         # Users can toggle at runtime — this only sets the initial state.

  - name: FORCE_DEMO_MODE
    value: "false"       # Set to "true" to force the app to render sample/mock data
                         # regardless of whether a live Databricks connection exists.
                         # Useful for demos to non-technical stakeholders without live data access.

secrets:
  # ─────────────────────────────────────────────────────────────────────────────
  # LLM API KEYS — Injected from Databricks Secrets at runtime.
  # Uncomment the provider(s) you want to enable.
  # The key name must match exactly what you stored with:
  #   databricks secrets put-secret --scope finops-copilot --key KEY_NAME
  #
  # Also update LLM_PROVIDER in config/settings.py (or add it as an env var above)
  # to tell the app WHICH provider to use: "anthropic" | "gemini" | "openai"
  # ─────────────────────────────────────────────────────────────────────────────
  - key: ANTHROPIC_API_KEY
    scope: finops-copilot
  # - key: GEMINI_API_KEY
  #   scope: finops-copilot
  # - key: OPENAI_API_KEY
  #   scope: finops-copilot
```

### What NOT to Put in app.yaml

These are **intentionally absent** from `app.yaml`:

| Setting | Why It's Not Here |
|---|---|
| `DATABRICKS_HOST` | Auto-injected by the Databricks Apps runtime |
| `DATABRICKS_TOKEN` | Not used in Apps — OAuth replaces it |
| `NOTEBOOK_FIRST_CELL_ID`, `NOTEBOOK_LAST_CELL_ID`, `NOTEBOOK_TOTAL_CELLS` | Removed — the `config/notebook_config.py` module mapper handles all cell routing dynamically |

---

## Step 6 — Deploy the Application

From the **project root directory** (where `app.yaml` and `app.py` live), run:

```bash
databricks apps deploy --source-code-path . finops-command-center
```

**What this command does:**
1. Uploads all project files from `.` to your Databricks workspace
2. Creates a new App named `finops-command-center` if it doesn't exist, or updates it if it does
3. Reads `app.yaml` and starts the Streamlit process

**First deployment typically takes 3–5 minutes** while Databricks provisions the app infrastructure, installs `requirements.txt`, and starts the Streamlit server.

### Monitor Deployment Progress

```bash
# Check status
databricks apps get finops-command-center

# Stream live logs during startup
databricks apps logs finops-command-center --follow
```

### Find the App URL

Once status shows `RUNNING`:
```bash
databricks apps get finops-command-center
# Look for the "url" field, e.g.:
# url: https://finops-command-center-abc123.databricksapps.com
```

> The URL is also visible in the Databricks workspace UI: left sidebar → **Apps** → click your app.

---

## Step 7 — Post-Deployment Verification

Run through this checklist after the app URL is accessible:

### Basic Page Load

| Check | Expected |
|---|---|
| App URL loads without error | Home page with FinOps Copilot header visible |
| No blank page or 500 error | — |
| Sidebar renders | Home, Command Centre, Cost Lookup, Log Analyzer links visible |
| Theme toggle works | Switches between dark and light mode |

### Data Connectivity

| Check | Expected |
|---|---|
| Home page → Workspace Cost Forecast | Chart renders with bar data (not "No data available") |
| Command Centre → Overall → KPI cards | Non-zero values for MTD Spend, 7-Day Cost |
| Command Centre → SQL Warehouse → Cache hit % | A percentage value (not 0.0%) |
| Command Centre → Storage Health | Table list populates |

### Intelligence Panels

| Check | Expected |
|---|---|
| Click 📡 on any chart | Right panel slides in with module cards |
| Module card links | Clicking "Open in Notebook" opens the Databricks notebook |
| Click "🔍 Analyze Issues" | Panel expands below the section header |

### Log Analyzer

| Check | Expected |
|---|---|
| Navigate to Log Analyzer | Form renders with Pipeline Name, Run fields |
| Click "Execute Log Preprocessor" with pipeline-1/Run-1 | Health Score appears (e.g., 40/100) with detected issues |
| Click "Generate AI Recommendations" | AI recommendations panel appears (requires LLM key) |

### Refresh Functionality

| Check | Expected |
|---|---|
| Sidebar "🔄 Refresh Data" | Toast: "Dashboards are refreshed!" after data reloads |
| Section-level "🔄 Refresh" button | Only that section's data reloads |

---

## Granting Permissions to the App

By default, only workspace admins can see a Databricks App. To grant access to your team:

### Grant Access to Specific Users or Groups

In the Databricks workspace UI:
1. Left sidebar → **Apps**
2. Click `finops-command-center`
3. Click the **Permissions** tab
4. Add users, service principals, or groups with **Can View** or **Can Manage** permission

### Grant the App Access to System Tables

When the app runs on Databricks, it uses the workspace's app service principal. This principal must have `SELECT` access to system tables:

```sql
-- Run in the Databricks SQL Editor as an admin
-- Replace 'finops-command-center' with your app's service principal name
GRANT USE CATALOG ON CATALOG system TO `finops-command-center`;
GRANT USE SCHEMA ON SCHEMA system.billing TO `finops-command-center`;
GRANT SELECT ON TABLE system.billing.usage TO `finops-command-center`;

GRANT USE SCHEMA ON SCHEMA system.query TO `finops-command-center`;
GRANT SELECT ON TABLE system.query.history TO `finops-command-center`;

GRANT USE SCHEMA ON SCHEMA system.storage TO `finops-command-center`;
GRANT SELECT ON TABLE system.storage.delta_tables TO `finops-command-center`;
```

> You can find the app's service principal name in Databricks: **Settings** → **Identity and access** → **Service principals**. Look for a principal with the same name as your app.

---

## Updating the App After Code Changes

To push updated code to the live app, simply re-run the deploy command:

```bash
databricks apps deploy --source-code-path . finops-command-center
```

- **Code changes** take effect after the deploy completes (30–60 seconds for a warm update)
- **Environment variable changes** in `app.yaml` also take effect after redeploy
- **Secret value changes** (via `databricks secrets put-secret`) take effect at the next redeploy

There is **no need to restart** the app manually — the deploy command handles it.

---

## Environment Variables Reference

Complete list of all variables the app reads from the environment:

| Variable | Set In | Required | Description |
|---|---|---|---|
| `DATABRICKS_HOST` | Auto-injected by runtime | Auto | Workspace URL. Never set manually in App. |
| `DATABRICKS_WAREHOUSE_ID` | `app.yaml` env | **Yes** | SQL Warehouse to run queries against |
| `DATABRICKS_TOKEN` | `config/settings.py` (local only) | Local only | PAT for local dev. Not used in Apps. |
| `DATABRICKS_CLIENT_ID` | `app.yaml` env (optional) | No | Service Principal Client ID for OAuth authentication. |
| `DATABRICKS_CLIENT_SECRET` | `app.yaml` secrets (optional) | No | Service Principal Client Secret for OAuth authentication. |
| `DATABRICKS_CATALOG` | `app.yaml` env (optional) | No | Catalog for system tables. Default: `system` |
| `DATABRICKS_QUERY_TIMEOUT` | `app.yaml` env (optional) | No | Query timeout in seconds. Default: `60` |
| `DATABRICKS_CACHE_TTL` | `app.yaml` env (optional) | No | Cache TTL in seconds. Default: `7200` (2 hours) |
| `NOTEBOOK_NAME` | `app.yaml` env | No | Display name for the notebook in the sidebar footer. |
| `NOTEBOOK_BTN_LABEL` | `app.yaml` env | No | Label text for the notebook link button in the top right. |
| `NOTEBOOK_ID` | `app.yaml` env | No | Numeric notebook ID for deep links |
| `NOTEBOOK_WORKSPACE_PATH` | `app.yaml` env (optional) | No | Full workspace path for the notebook |
| `LLM_PROVIDER` | `app.yaml` env (optional) | No | Active AI provider. Default: `gemini` |
| `ANTHROPIC_API_KEY` | `app.yaml` secrets | No | Claude API key |
| `GEMINI_API_KEY` | `app.yaml` secrets | No | Gemini API key |
| `OPENAI_API_KEY` | `app.yaml` secrets | No | OpenAI API key |
| `DEFAULT_THEME` | `app.yaml` env | No | Starting theme. Default: `dark` |
| `FORCE_DEMO_MODE` | `app.yaml` env | No | Force mock data. Default: `false` |

---

## Troubleshooting

### App fails to start / shows 500 error

**Check the logs first:**
```bash
databricks apps logs finops-command-center --follow
```

| Symptom | Likely Cause | Fix |
|---|---|---|
| `ModuleNotFoundError` | Missing pip package | Ensure `requirements.txt` is complete and committed |
| `SyntaxError` in log | Python syntax error | Check `app.py` or any recently edited page file |
| Process exits immediately | `app.yaml` command is wrong | Verify `command:` line exactly matches what's in this guide |

---

### All dashboards show "No data available"

The app is running but can't reach live data.

| Check | Command / Action |
|---|---|
| Is the SQL Warehouse running? | Databricks → SQL Warehouses → verify status is "Running" |
| Is `DATABRICKS_WAREHOUSE_ID` correct? | `databricks apps get finops-command-center` → check env vars |
| Does the system tables data exist? | `SELECT COUNT(*) FROM system.billing.usage` in SQL Editor |
| Does the app have SELECT permission? | Run the GRANT statements in the [Permissions section](#granting-permissions-to-the-app) |

---

### Individual sections show no data but Overall works

This usually means System Tables were enabled unevenly:
- **SQL Warehouse section empty:** `system.query.history` not enabled or no warehouse queries in the time window
- **Storage Health empty:** `system.storage.delta_tables` not enabled
- **Chargeback empty:** No clusters have team tags applied

---

### Notebook deep-link buttons don't work

| Symptom | Fix |
|---|---|
| "Open Notebook" goes to a generic Databricks URL | `NOTEBOOK_ID` is empty or wrong in `app.yaml` — find and set the correct numeric ID |
| 403 / Access Denied on the notebook | The user doesn't have permission to view the notebook in Databricks |

---

### ClusterDNA AI recommendations fail

| Symptom | Fix |
|---|---|
| "Gemini API key not configured" error | Add `GEMINI_API_KEY` to Databricks Secrets and update `app.yaml` secrets section |
| "google-genai package not installed" | Ensure `google-genai>=0.5.0` is in `requirements.txt` |
| Empty or garbled AI response | Try switching `GEMINI_MODEL` to `gemini-1.5-pro` in `log_processor/log_processor_settings.py` |

---

### Port conflict (local development only)

If port 8601 (backend) or 5173 (frontend) is already in use:
```bash
# Run backend on another port (e.g., 8602)
python -m uvicorn api.main:app --port 8602 --reload

# Update frontend/vite.config.js target proxy to point to the new port (http://localhost:8602)
# Run frontend on another port (e.g., 5174)
npm run dev -- --port 5174
```

---

## Network Ports & Interface Bindings (Deployment Reference)

While deploying the application, the deployment user needs to know how the network ports are configured and routed:

* **Local Development Ports**:
  * **Vite Frontend Server**: Listens on **`127.0.0.1:5173`** (configurable in `vite.config.js`).
  * **FastAPI Backend Server**: Listens on **`127.0.0.1:8601`**. All backend API routes (`/api/*`) are proxied automatically from the frontend server to the backend server.
* **Production Ports (Databricks Apps)**:
  * **Single Listening Port**: The application starts inside a secure Docker container in Databricks. The startup command `uvicorn api.main:app --host 0.0.0.0 --port 8080` binds uvicorn to **all interfaces (`0.0.0.0`) on port `8080`**.
  * **Reverse Proxy**: Databricks Apps runtime handles the external HTTPS traffic, mapping the container's internal port `8080` to the public secure app URL automatically.
  * **Unified Build Serving**: The React application is pre-compiled using `npm run build` and the output `dist` folder is served directly by the FastAPI backend on port `8080`.

---

## Deployment Architecture

This diagram shows the complete data and authentication flow once the app is deployed:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Developer / CI Pipeline                             │
│                                                                             │
│  $ databricks apps deploy --source-code-path . finops-command-center        │
│    └─ Uploads source code to workspace                                      │
│    └─ Reads app.yaml for config                                             │
│    └─ Resolves secrets from Databricks Secrets vault                        │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Databricks Workspace                               │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    Databricks Apps Runtime                           │   │
│  │                                                                      │   │
│  │  Environment Variables Injected at Startup:                          │   │
│  │  ├── DATABRICKS_HOST        (auto by runtime)                        │   │
│  │  ├── DATABRICKS_WAREHOUSE_ID (from app.yaml env)                     │   │
│  │  ├── NOTEBOOK_ID            (from app.yaml env)                      │   │
│  │  └── ANTHROPIC_API_KEY      (from Databricks Secrets, encrypted)     │   │
│  │                                                                      │   │
│  │  Process: streamlit run app.py --server.port 8080                    │   │
│  │                                                                      │   │
│  │  config/settings.py reads all of the above via os.getenv()           │   │
│  └────────────────────────────────────┬─────────────────────────────────┘   │
│                                       │  databricks-sql-connector           │
│  ┌────────────────────────────────────▼─────────────────────────────────┐   │
│  │                  SQL Warehouse (Query Execution)                     │   │
│  │                                                                      │   │
│  │  system.billing.usage         ← All cost dashboards                  │   │
│  │  system.query.history         ← SQL Warehouse section                │   │
│  │  system.storage.delta_tables  ← Storage Health section               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                              HTTPS + Databricks SSO
                                    │
                                    ▼
                    ┌─────────────────────────────┐
                    │         End Users           │
                    │  (browser — SSO protected)  │
                    └─────────────────────────────┘
```
