# Databricks Account Migration & New Machine Setup Guide

This guide covers two scenarios:

1. **Moving to a different Databricks account/workspace** — changing the Databricks credentials the app connects to
2. **Setting up on a new/different laptop** — installing all required software and getting the app running from scratch

Both scenarios share the same configuration steps. Read **Part A** (Databricks side) for either scenario, and **Part B** (Machine side) if setting up on a new laptop.

---

## 🔵 PART A — Databricks Side

### Prerequisites Checklist (Databricks)

Complete the following steps in your **target Databricks account/workspace** before running the app:

---

### A1. Enable System Tables (Account Admin Required)

System Tables are disabled by default in new Databricks accounts. A **Databricks Account Admin** must enable them:

1. Log in to the Databricks Account Console: `https://accounts.cloud.databricks.com`
2. Go to **Settings** → **Feature Enablement**
3. Enable the following system table schemas:
   - **Billing** → powers `system.billing.usage` (all cost dashboards)
   - **Compute** → powers `system.compute.clusters` (cluster config data)
   - **Query** → powers `system.query.history` (SQL Warehouse section)
   - **Storage** → powers `system.storage.*` (Storage Health section)
   - **LakeFlow** → powers `system.lakeflow.*` (Jobs + DLT sections)

> [!NOTE]
> System tables take up to **24–48 hours** after activation to populate with historical usage data. The app will work — dashboards will show empty charts during this window, which resolves automatically.

**Verify tables are accessible** — run this in Databricks SQL Editor:
```sql
SELECT * FROM system.billing.usage LIMIT 5;
SELECT * FROM system.lakeflow.job_run_timeline LIMIT 5;
```

---

### A2. Configure SELECT Permissions

The token/credential you use must have read access to the `system` catalog.

**If the token belongs to an Account Admin or Metastore Admin:**
No action needed — admins automatically have full read access.

**If the token belongs to a Standard User or Service Principal:**
An admin must run one of these in the Databricks SQL Editor:

```sql
-- For a standard user (Personal Access Token):
GRANT SELECT ON CATALOG system TO `user_email@company.com`;

-- For a Service Principal (recommended for shared/production use):
GRANT SELECT ON CATALOG system TO `service_principal_application_id`;
```

---

### A3. Create or Identify a SQL Warehouse

The app runs all Databricks queries through a SQL Warehouse. You need its **Warehouse ID**.

**Recommended Warehouse Settings:**

| Setting | Recommended Value | Reason |
| :--- | :--- | :--- |
| Type | Serverless | No cold start; auto-scales to zero when idle |
| Size | Small (2 DBU/hr) | Sufficient for all FinOps dashboards |
| Auto-stop | 10 minutes | Avoids idle billing |

**How to find the Warehouse ID:**
1. Databricks sidebar → **SQL Warehouses**
2. Click your warehouse → **Connection Details** tab
3. The HTTP path looks like: `/sql/1.0/warehouses/abc123def456789`
4. Your Warehouse ID is the part after `/warehouses/`: `abc123def456789`

---

### A4. Upload the Companion Notebook (Optional — for Module Deep Links)

The app sidebar contains a link to a companion optimization notebook. If you want the deep-link buttons in the Analysis panel (📡) to open specific notebook cells:

1. Import the companion notebook (`FinOps_Databricks_FullDemo_v5-5.dbc` or `.ipynb`) into a folder in your target workspace
2. Open the notebook in Databricks and look at the URL bar:
   ```
   https://your-host/#notebook/1561959874304159/command/...
   ```
3. The number after `#notebook/` is your **Notebook ID** (e.g., `1561959874304159`)

> **Note:** If you skip this step, all dashboards and analysis panels still work fully. Only the "Open in Notebook" module deep links will fall back to a generic Databricks public URL.

---

### A5. Gather All Required Values

Before moving to configuration, collect these values:

| Field | Where to Find It | Example |
| :--- | :--- | :--- |
| `DATABRICKS_HOST` | Browser address bar when in your workspace | `https://dbc-abcd1234.cloud.databricks.com` |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouses → Connection Details → extract from HTTP path | `1b8d98a18f4f9706` |
| `DATABRICKS_TOKEN` | User Settings → Developer → Access tokens → Generate new | `dapi_abc123...` |
| `NOTEBOOK_ID` | Open notebook in Databricks, copy number from URL | `1561959874304159` |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) (optional, for AI) | `AIza...` |

---

## 🟢 PART B — Machine (Laptop) Side

This section covers setting up the app on a **new Windows laptop** from scratch.

---

### B1. Install Required Software

#### Python 3.10 or 3.12+ (Required for backend)

1. Download from [python.org/downloads](https://www.python.org/downloads/)
2. Run the installer
3. **Important**: Tick **"Add Python to PATH"** on the first installer screen
4. Complete installation

**Verify Python is installed — open a new PowerShell window:**
```powershell
python --version   # should print Python 3.10.x or 3.12.x
```

If `python` is not found, try:
```powershell
py --version
```

> **💡 How to find Python's exact path on your machine (if needed):**
> ```powershell
> # Option 1 — if python is in PATH:
> Get-Command python | Select-Object -ExpandProperty Source
>
> # Option 2 — look in the default Windows install folder:
> Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Directory | Select-Object Name
> # Common paths:
> #   C:\Users\<YourName>\AppData\Local\Programs\Python\Python312\python.exe
> #   C:\Python312\python.exe
> ```
> Use this full path if `python` command is not in PATH.

---

#### Node.js 18+ and npm (Required for frontend)

1. Download from [nodejs.org](https://nodejs.org) — choose the **LTS** version
2. Run the installer — npm is bundled automatically, no extra step needed
3. Open a **new** PowerShell window after installation

**Verify:**
```powershell
node --version   # should print v18.x.x or higher
npm --version    # should print 9.x.x or higher
```

> If `node` or `npm` is not recognized, restart your terminal. If still not found, reboot Windows once — the PATH update may need a restart.

---

### B2. Get the Source Code

Copy or clone the `react_with_python_fast_api` folder to your machine. The folder structure should look like:

```
react_with_python_fast_api/
├── api/
├── config/
├── data/
├── frontend/
├── log_processor/
├── requirements.txt
├── app.yaml
└── README.md
```

---

### B3. Create the `.env` File

In the project root folder (`react_with_python_fast_api`), create a file named `.env` (note: no extension, just `.env`).

Copy and fill in the following — use the values you collected in **Part A5**:

```env
# ── REQUIRED: Databricks Connection ──────────────────────────────────────────
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com/
DATABRICKS_WAREHOUSE_ID=your_sql_warehouse_id_here
DATABRICKS_CATALOG=system

# Choose ONE authentication approach:
# Approach A — Personal Access Token (simplest for local dev)
DATABRICKS_TOKEN=dapi_your_personal_access_token_here

# Approach B — OAuth Service Principal (for shared/team use)
# Leave DATABRICKS_TOKEN blank and fill these:
# DATABRICKS_CLIENT_ID=
# DATABRICKS_CLIENT_SECRET=

# ── OPTIONAL: Companion Notebook (for deep-link buttons) ─────────────────────
NOTEBOOK_NAME=FinOps DBX Developer Notebook
NOTEBOOK_BTN_LABEL=Open Developer Notebook
NOTEBOOK_ID=your_notebook_id_here
NOTEBOOK_WORKSPACE_PATH=/Workspace/Users/your_user@company.com/your_notebook_name

# ── OPTIONAL: AI Recommendations (Run Intelligence Engine) ───────────────────
# Without a key, all dashboards still work. Only the AI step in Run Intelligence
# requires a key.
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_google_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# ── OPTIONAL: Cache & Pool Tuning (defaults are fine for most users) ─────────
DATABRICKS_CACHE_TTL=7200
DATABRICKS_POOL_SIZE=8
```

---

### B4. Set Up Python Virtual Environment

Open **PowerShell** in the project root folder and run:

```powershell
# Create virtual environment (isolates packages from other Python projects)
python -m venv venv

# Activate the virtual environment
.\venv\Scripts\Activate.ps1
```

> **⚠️ PowerShell Execution Policy Error?**
> If you see `cannot be loaded because running scripts is disabled`, run this once:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Then retry `.\venv\Scripts\Activate.ps1`.
>
> Your prompt will show `(venv)` when activated.

---

### B5. Install Python Dependencies

With the venv activated:

```powershell
pip install -r requirements.txt
```

> You only need to do this once per machine (or when `requirements.txt` changes).

---

### B6. Install Frontend Node Packages

```powershell
cd frontend
npm install
cd ..
```

> You only need to do this once (or when `package.json` changes).

---

### B7. Verify the Databricks Connection

Before starting the app, verify your credentials work by running a quick test query in the Databricks SQL Editor using your token:

```sql
SELECT * FROM system.billing.usage LIMIT 5;
```

If this returns rows, your credentials are valid. If it throws an error, fix the token/permissions before proceeding.

---

### B8. Run the Application

**Two PowerShell terminals required — keep both open.**

**Terminal 1 — Backend (FastAPI):**

```powershell
# Navigate to project root
cd <path-to>\react_with_python_fast_api

# Activate venv
.\venv\Scripts\Activate.ps1

# Start the backend server
python -m uvicorn api.main:app --host 127.0.0.1 --port 8601
```

Wait until you see:
```
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8601
```

> **If `python` is not recognized after activating the venv**, use the full path found in B1:
> ```powershell
> & "C:\Users\<YourName>\AppData\Local\Programs\Python\Python312\python.exe" -m uvicorn api.main:app --host 127.0.0.1 --port 8601
> ```

**Terminal 2 — Frontend (Vite dev server):**

```powershell
cd <path-to>\react_with_python_fast_api\frontend
npm run dev
```

Wait until you see:
```
  ➜  Local:   http://localhost:5173/
```

**Open your browser at: `http://localhost:5173`**

> **How the proxy works:** Vite automatically forwards all `/api/*` requests to the backend at `http://127.0.0.1:8601`. This is configured in `frontend/vite.config.js`. You do not need to configure anything manually.

---

## 🔴 Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| `python` not recognized | Python not in PATH | Use full path (found in B1) or reinstall Python with "Add to PATH" ticked |
| `npm` not recognized | Node.js not installed or terminal not restarted | Install from nodejs.org and open a **new** terminal |
| venv activation blocked | PowerShell Execution Policy | `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| `ModuleNotFoundError` on backend | venv not activated or packages not installed | Activate venv first, then `pip install -r requirements.txt` |
| Dashboard shows blank/no data | System Tables not enabled or token lacks SELECT | Run `SELECT * FROM system.billing.usage LIMIT 5` with your token to check |
| "Table not found" error | System Tables not enabled in Databricks | Enable via Account Console → Settings → Feature Enablement |
| CORS or fetch errors | Backend not running | Start Terminal 1 (backend) before Terminal 2 (frontend) |
| Dashboards empty after 48h | Token lacks permissions | Run `GRANT SELECT ON CATALOG system TO \`your_user@company.com\`` |
| `npm run dev` works but charts empty | Wrong port or backend not running | Confirm backend is running on port 8601 |

---

## 📌 Port & Routing Reference

| Mode | Frontend | Backend | URL to Open |
| :--- | :--- | :--- | :--- |
| Local Dev (2 terminals) | Vite on `5173` | Uvicorn on `8601` | `http://localhost:5173` |
| Production Single-Server | Built → served by FastAPI | `8601` | `http://localhost:8601` |
| Databricks Apps (cloud) | Built → served by FastAPI | `8080` (fixed by platform) | Databricks-provided HTTPS URL |

For production single-server mode, build the React app first:
```powershell
cd frontend
npm run build
cd ..
python -m uvicorn api.main:app --host 0.0.0.0 --port 8601
```

