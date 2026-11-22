# ⚡ FinOps CoPilot App — Databricks Cost Intelligence

An enterprise-grade Financial Operations (FinOps) and workload optimization application built specifically for **Databricks**. It transforms raw billing, compute telemetry, pipeline metrics, and execution logs into actionable cost insights, proactive alerts, and AI-driven recommendations.

---

## 🏗️ End-to-End System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REACT FRONTEND (SPA)                              │
│  Vite · React 18 · Plotly.js · Recharts · Lucide Icons                     │
│  Pages: Home · Command Centre · Cost Lookup · Run Intelligence · Calculator │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ REST API calls (/api/*)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FASTAPI BACKEND (Python)                           │
│  Uvicorn · In-Memory Cache (2h TTL) · Thread Pool · 13 Domain Routers      │
└───────────────────┬────────────────────────────────────────┬────────────────┘
                    │                                        │
                    ▼                                        ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│ DATABRICKS SYSTEM TABLES & LOGS      │  │ LLM RECOMMENDATIONS ENGINE        │
│ system.billing.* · system.compute.*  │  │ Google Gemini / Anthropic Claude  │
│ system.lakeflow.* · system.query.*   │  │ 6-Dimension Optimization Advice   │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

### Key Components

1. **Frontend (React 18 + Vite)**
   - **Location**: `frontend/`
   - **Tech Stack**: React 18, Vite, React Router v6, Plotly.js, Lucide React icons.
   - **Features**: SPA offering Command Centre (9 tabs), Run Intelligence, Cost Lookup, Cost Calculator, and Home forecast.

2. **Backend (FastAPI + Uvicorn)**
   - **Location**: `api/` & `config/`
   - **Tech Stack**: Python 3.10+, FastAPI, Uvicorn, Pandas, PyArrow, Databricks SQL Connector.
   - **Features**: 13 RESTful API routers, in-memory caching (2h TTL), pre-warming background threads, connection pool.

3. **Data Layer (Databricks System Tables & SQL Warehouse)**
   - **Location**: `data/` & `data/queries/`
   - **Sources**: Direct SQL queries against Unity Catalog System Tables (`system.billing.*`, `system.compute.*`, `system.lakeflow.*`, `system.query.*`).

4. **Run Intelligence & AI Engine**
   - **Location**: `log_processor/run_intelligence/`
   - **Features**: Data fusion combining System Tables, Event Logs, and Driver Logs → AI-driven cost optimization across 6 dimensions.

---

## 💻 System & Software Prerequisites

Before setting up this application, ensure the following software is installed:

| Software | Required Version | Purpose |
| :--- | :--- | :--- |
| **Python** | `3.10` or `3.12+` | Runs the FastAPI backend server & Databricks connector |
| **Node.js** | `v18.0.0+` | Required to build & run the React frontend dev server |
| **npm** | `v9.0.0+` | Manages frontend Node packages (comes bundled with Node.js) |
| **Git** | Any modern version | Code version control |
| **Databricks Access** | Unity Catalog Enabled | Active SQL Warehouse + System Tables read access |

> **💡 Does installing Node.js alone suffice?**
> Yes — when you install Node.js from [nodejs.org](https://nodejs.org), **npm is included automatically**. You do NOT need to set any system environment variables manually. Node.js adds itself to your Windows `PATH` during installation. After installation, open a **new** PowerShell window and verify:
> ```powershell
> node --version   # should print v18.x.x or higher
> npm --version    # should print 9.x.x or higher
> ```
> If `node` or `npm` is not found, restart your terminal or reboot Windows once after Node.js installation.

---

## 🚀 Setup & Installation Guide (For New Machine / Laptop)

Follow these steps in order. Do not skip any step.

### Step 1: Navigate to the Project Directory

Open PowerShell and go to the project root:

```powershell
cd "C:\Users\dell\Downloads\dpdp\finops\FinOps_CoPilot_App_v1\react_with_python_fast_api"
```

---

### Step 2: Configure Environment Variables (`.env`)

This is the **most important step**. Create a file named `.env` in the root folder (`react_with_python_fast_api/.env`).

You can copy the template file and fill in your values:

```powershell
# PowerShell — copy the example file
Copy-Item .env.example .env
```

Then open `.env` and fill in the required fields:

```env
# ── REQUIRED: Databricks Connection ────────────────────────────────────────────
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com/
DATABRICKS_WAREHOUSE_ID=your_sql_warehouse_id_here
DATABRICKS_TOKEN=dapi_your_personal_access_token_here

# Catalog where system tables live (usually keep this as 'system')
DATABRICKS_CATALOG=system

# ── REQUIRED FOR NOTEBOOK LINKS: Companion Notebook ────────────────────────────
# Open your FinOps notebook in Databricks. The URL looks like:
# https://your-host/#notebook/1234567890123456
# Copy the number after "#notebook/" — that is your NOTEBOOK_ID
NOTEBOOK_NAME=FinOps DBX Developer Notebook
NOTEBOOK_BTN_LABEL=Open Developer Notebook
NOTEBOOK_ID=your_notebook_id_here
NOTEBOOK_WORKSPACE_PATH=/Workspace/Users/your_user@company.com/your_notebook_name

# ── OPTIONAL: AI Recommendations (Run Intelligence Engine) ─────────────────────
# Without a Gemini key, all dashboards & charts still work fully.
# Only the AI Recommendations step in Run Intelligence is affected.
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# ── OPTIONAL: Cache & Pool Tuning (defaults are fine for most users) ───────────
DATABRICKS_CACHE_TTL=7200
DATABRICKS_POOL_SIZE=8

# ── OPTIONAL: CORS (only needed for local dev — leave as-is) ───────────────────
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

> **📌 Where to find your Databricks credentials:**
>
> | Field | Where to find it |
> |---|---|
> | `DATABRICKS_HOST` | Your workspace URL in the browser address bar (e.g. `https://dbc-abcd1234.cloud.databricks.com`) |
> | `DATABRICKS_WAREHOUSE_ID` | Databricks → SQL Warehouses → select your warehouse → Connection details tab → copy the string after `/warehouses/` in the HTTP path |
> | `DATABRICKS_TOKEN` | Databricks → top-right user icon → Settings → Developer → Access tokens → Generate new token |
> | `NOTEBOOK_ID` | Open the companion notebook in Databricks, look at the URL: `.../#notebook/1561959874304159` — the number `1561959874304159` is your ID |

---

### Step 3: Find Your Python Executable

Python is not always installed at the same path on every machine. Before creating the virtual environment, verify which Python you have:

```powershell
# Try these in order — use whichever works and prints a version 3.10+
python --version
py --version
python3 --version

# If none work, find the full path to your Python installation:
Get-Command python | Select-Object -ExpandProperty Source
# or check the Windows App folder:
Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Directory | Select-Object Name
```

You will use the command that worked (e.g., `python`, `py`, or a full path) in all subsequent steps.

> **💡 Common Python locations on Windows:**
> - `C:\Users\<YourName>\AppData\Local\Programs\Python\Python312\python.exe`
> - `C:\Python312\python.exe`
> - Just `python` (if added to PATH during installation)
> - Just `py` (the Python Launcher — bundled with most Windows installs)
>
> **Recommended:** During Python installation from [python.org](https://python.org), always tick **"Add Python to PATH"**. This lets you simply use `python` everywhere.

---

### Step 4: Install Backend Python Dependencies

Run these commands from the project root folder (`react_with_python_fast_api`).
In all commands below, replace `python` with whichever command worked in Step 3 (e.g., `py`, `python3`, or a full path).

```powershell
# Step 4a: Create a virtual environment (keeps packages isolated from other projects)
python -m venv venv

# Step 4b: Activate the virtual environment
.\venv\Scripts\Activate.ps1
```

> **⚠️ PowerShell Execution Policy Error?**
> If you see `cannot be loaded because running scripts is disabled`, run this once:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Then retry `.\venv\Scripts\Activate.ps1`.

After activation, your prompt will show `(venv)` prefix. Then install all Python packages:

```powershell
# Step 4c: Install Python packages
pip install -r requirements.txt
```

> **💡 Already have a venv? Just activate it:**
> ```powershell
> .\venv\Scripts\Activate.ps1
> ```
> You only need to run `pip install -r requirements.txt` once per machine (or when requirements.txt changes).

---

### Step 5: Install Frontend Node Modules

Navigate to the `frontend/` directory and install the required Node packages:

```powershell
cd frontend
npm install
cd ..
```

> **💡 `npm install` only needs to be run once** (or again if `package.json` changes). The `node_modules/` folder (~300MB) is generated locally and does NOT need to be committed to Git.

---

## 🏃 How to Run the Application

You can run in **Development Mode** (two terminals) or **Production Mode** (one terminal).

---

### Option A: Local Development Mode (Two PowerShell Terminals)

Open **two separate PowerShell windows**. Both must stay open while you use the app.

**Terminal 1 — Run the Backend (FastAPI)**

```powershell
cd "C:\<path-to-project>\react_with_python_fast_api"
.\venv\Scripts\Activate.ps1
python -m uvicorn api.main:app --host 127.0.0.1 --port 8601
```

> **💡 If `python` doesn't work** after activating the venv, use the full Python path you found in Step 3:
> ```powershell
> & "C:\Users\<YourName>\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn api.main:app --host 127.0.0.1 --port 8601
> ```

Wait until you see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8601
```

**Terminal 2 — Run the Frontend (Vite Dev Server)**

```powershell
cd "C:\Users\dell\Downloads\dpdp\finops\FinOps_CoPilot_App_v1\react_with_python_fast_api\frontend"
npm run dev
```

Wait until you see:
```
  ➜  Local:   http://localhost:5173/
```

**Open your browser at: `http://localhost:5173`**

> **How the proxy works**: The Vite dev server automatically forwards all `/api/*` requests to `http://127.0.0.1:8601`. This is configured in `frontend/vite.config.js`. You do **not** need to configure anything manually.

---

### Option B: Production Single-Server Mode (One Terminal)

In production, FastAPI serves the compiled React app. **Node.js is NOT needed at runtime.**

```powershell
# Step 1: Build the React frontend into static files
cd "C:\<path-to-project>\react_with_python_fast_api\frontend"
npm run build
cd ..

# Step 2: Start the unified backend+frontend server
python -m uvicorn api.main:app --host 0.0.0.0 --port 8601
```

**Open your browser at: `http://localhost:8601`**

> This mode is also accessible across your local network via your machine's IP address (e.g., `http://192.168.1.xx:8601`).

---

### Option C: Deploy to Databricks Apps (Cloud Production)

To deploy natively inside the Databricks Apps cloud environment:

```bash
# From the project root
databricks apps deploy finops-copilot
```

Uses configuration specified in `app.yaml`. The compiled React build (`frontend/dist/`) is served by FastAPI at port 8080 inside the Databricks Apps container.

---

## 🛠️ Troubleshooting & FAQs

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `ModuleNotFoundError` on backend startup | Python dependencies not installed in the active venv | Activate venv first: `.\venv\Scripts\Activate.ps1`, then run `pip install -r requirements.txt` |
| `'python' is not recognized` | Python not in PATH or wrong python used | Use the full path: `& "C:\Users\dell\AppData\Local\Programs\Python\Python312\python.exe"` |
| `'npm' is not recognized` | Node.js not installed or terminal not restarted | Install from [nodejs.org](https://nodejs.org) and open a **new** terminal |
| PowerShell script blocked | Execution policy restricts scripts | Run: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `Frontend Assets Not Built` page on port 8601 | React not compiled for single-server mode | Run `cd frontend && npm install && npm run build` |
| Databricks SQL connection failure | Invalid host, token, or warehouse ID | Verify credentials in `.env` and check SQL Warehouse is Running in Databricks UI |
| CORS or API fetch errors on port 5173 | Backend not running on port 8601 | Start Terminal 1 (backend) first, then Terminal 2 (frontend) |
| Missing / empty dashboard data | System Tables not enabled or token lacks SELECT | Enable system tables in Databricks Account Console; run `SELECT * FROM system.billing.usage LIMIT 5` with your token to verify |
| Charts blank but no errors | Databricks System Tables have no historical data yet | System tables need 24-48 hours to populate after first-time enablement |

---

## 📁 Project Directory Structure

```
react_with_python_fast_api/
├── .env                    # Local environment variables (Databricks credentials) ← CREATE THIS
├── .env.example            # Environment variables template
├── app.yaml                # Databricks Apps deployment manifest
├── README.md               # This file — setup & run guide
├── requirements.txt        # Python backend dependencies
│
├── api/                    # FastAPI application & 13 domain routers
│   ├── main.py             # Entry point: CORS, router mounts, SPA serving
│   ├── cache.py            # In-memory TTL cache engine (2h default)
│   └── routers/            # overall, jobs, sql_warehouse, dlt, storage, etc.
│
├── config/                 # Configuration management
│   ├── settings.py         # All env-var settings (DB host, token, LLM keys, etc.)
│   ├── notebook_config.py  # 20 optimization module → notebook cell ID mapping
│   └── run_intelligence_settings.py  # Run Intelligence Engine control plane
│
├── data/                   # Databricks SQL connector & query modules
│   ├── db.py               # Connection pool + run_query() + refresh_all_caches()
│   └── queries/            # 10 domain SQL query files
│
├── log_processor/          # Run Intelligence Engine & LLM AI processor
│   ├── prompts.py          # LLM system prompts & user prompt builders
│   └── run_intelligence/   # 6 modules: system_table_fetcher, event_log_fetcher,
│                           # log_file_resolver, run_preprocessor, ai_engine, etc.
│
├── frontend/               # React Vite source code
│   ├── vite.config.js      # Dev server + API proxy config (→ port 8601)
│   ├── package.json        # Frontend Node dependencies
│   ├── dist/               # Production compiled assets (after npm run build)
│   └── src/
│       ├── App.jsx         # Root: navigation, theme, toasts
│       ├── api/            # client.js + index.js (typed API calls)
│       ├── components/     # Sidebar, TopBar, RightPanel, PlotlyChart, MetricCard
│       └── pages/          # Home, CommandCentre, CostLookup, RunIntelligence,
│                           # CostCalculator + 9 CommandCentre tab components
│
└── documentation/          # Detailed technical & deployment guides
```
