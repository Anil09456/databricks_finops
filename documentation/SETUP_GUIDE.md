# 🚀 Setup & Quick Start Guide — FinOps CoPilot

> **Audience:** Developers, DevOps engineers, and team members setting up the FinOps CoPilot application locally on their machine.
>
> This guide provides step-by-step instructions to configure, install prerequisites, and run the FinOps CoPilot application from scratch.

---

## 📋 Table of Contents
1. [Prerequisites Checklist](#1-prerequisites-checklist)
2. [Step-by-Step Node.js & npm Installation](#2-step-by-step-nodejs--npm-installation)
3. [Understanding Where Files Are Created (`node_modules` Containment)](#3-understanding-where-files-are-created-node_modules-containment)
4. [Configuring Environment Variables (`.env`)](#4-configuring-environment-variables-env)
5. [Starting the Application (Two Running Modes)](#5-starting-the-application-two-running-modes)
   - [Mode A: Fast Single-Port Mode (Zero Node.js Required)](#mode-a-fast-single-port-mode-zero-nodejs-required)
   - [Mode B: Full Developer Mode (React Hot-Reloading)](#mode-b-full-developer-mode-react-hot-reloading)
6. [Verification Checklist](#6-verification-checklist)
7. [Troubleshooting Common Issues](#7-troubleshooting-common-issues)

---

## 1. Prerequisites Checklist

Before you begin, ensure you have:
* **Operating System**: Windows 10/11, macOS, or Linux.
* **Python**: Version `3.10` or higher (`python --version`).
* **Node.js**: Version `18.x` or `20.x LTS` (Only needed for Developer Mode / Rebuilding).
* **Databricks Credentials**:
  * Workspace Host URL (e.g., `https://dbc-xxxx.cloud.databricks.com/`)
  * SQL Warehouse ID (from Databricks SQL Warehouses Connection Details)
  * Personal Access Token (PAT) or Service Principal credentials with `SELECT` privileges on the `system` catalog.

---

## 2. Step-by-Step Node.js & npm Installation

If you need to edit React components or recompile the frontend, follow these complete installation steps:

### A. Windows Installation
1. Go to the official Node.js website: **[https://nodejs.org/](https://nodejs.org/)**
2. Download the **LTS (Long Term Support)** Windows Installer (`.msi`), recommended version **20.x LTS**.
3. Double-click the downloaded `.msi` file to launch the setup wizard:
   * Click **Next** on the Welcome screen.
   * Accept the License Agreement and click **Next**.
   * Leave the default Destination Folder (`C:\Program Files\nodejs\`) and click **Next**.
   * On the **Custom Setup** screen, ensure that **"npm package manager"** and **"Add to PATH"** are selected (they are selected by default). Click **Next**.
   * On the **Tools for Native Modules** screen, you can leave the checkbox unchecked (not required for this app). Click **Next**.
   * Click **Install**. If prompted by Windows User Account Control (UAC), click **Yes**.
   * Click **Finish** once installation completes.

### B. macOS Installation
* **Option 1 (Official Installer):** Download the macOS Installer (`.pkg`) from [https://nodejs.org/](https://nodejs.org/) and follow the wizard.
* **Option 2 (Homebrew):** Open Terminal and run:
  ```bash
  brew install node@20
  ```

### C. Linux (Ubuntu / Debian) Installation
Open Terminal and run:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### D. Crucial Step: Verify Installation
> [!IMPORTANT]
> You **MUST close and reopen your terminal / PowerShell / VS Code** after installation so that the newly updated system PATH takes effect.

In your fresh terminal, run:
```bash
node -v
# Expected output: v18.x.x or v20.x.x

npm -v
# Expected output: 9.x.x or 10.x.x
```
If both commands return version numbers, Node.js and npm are installed successfully.

---

## 3. Understanding Where Files Are Created (`node_modules` Containment)

A common concern when running npm commands is ensuring that downloaded packages and build artifacts do **not** spill into arbitrary locations on your system.

### How Node.js & npm Strictly Confine Files
1. **The Current Working Directory Rule:**
   * npm reads the `package.json` file in the *current directory* from which the command is executed.
   * In our project, `package.json` exists **only** inside the `frontend/` directory.
   * When you navigate to `frontend/` and run `npm install`:
     ```bash
     cd react_with_python_fast_api/frontend
     npm install
     ```
   * npm creates the `node_modules` folder **strictly inside `frontend/node_modules/`**. It never writes packages outside this sub-folder.
2. **Build Output Containment:**
   * When you run `npm run build`, Vite compiles the React code.
   * In `frontend/vite.config.js`, the output directory is hardcoded:
     ```javascript
     build: {
       outDir: 'dist',
       sourcemap: false,
     }
     ```
   * All production HTML, CSS, and JS bundles are placed **strictly inside `frontend/dist/`**.
3. **Backend Serving Containment:**
   * In `api/main.py`, FastAPI references this exact relative path:
     ```python
     _DIST = Path(__file__).parent.parent / "frontend" / "dist"
     app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")
     ```
   * FastAPI serves exclusively from `frontend/dist/`.

---

## 4. Configuring Environment Variables (`.env`)

The backend automatically reads its settings from a `.env` file located in `react_with_python_fast_api/`.

1. In `react_with_python_fast_api/`, locate `.env.example`.
2. Create a copy named `.env`:
   ```bash
   # Windows (PowerShell):
   Copy-Item .env.example .env

   # macOS / Linux:
   cp .env.example .env
   ```
3. Open `.env` in any text editor and fill in your connection details:
   ```env
   # ── Databricks Connection ─────────────────────────────────────────────────────
   DATABRICKS_HOST="https://your-workspace-url.cloud.databricks.com/"
   DATABRICKS_WAREHOUSE_ID="your_sql_warehouse_id_here"
   DATABRICKS_TOKEN="dapi_your_personal_access_token_here"
   DATABRICKS_CATALOG="system"

   # ── Notebook References ───────────────────────────────────────────────────────
   NOTEBOOK_NAME="FinOps DBX Developer Notebook"
   NOTEBOOK_BTN_LABEL="Open Developer Notebook"
   NOTEBOOK_ID="your_notebook_id"
   NOTEBOOK_WORKSPACE_PATH="/Workspace/Users/.../FinOps_Databricks_FullDemo_v5-5"
   # Note: The notebook archive is available at notebooks/FinOps_Databricks_FullDemo_v5-5.dbc
   # Import it into your Databricks Workspace to obtain your NOTEBOOK_ID.

   # ── AI Diagnostics ────────────────────────────────────────────────────────────
   LLM_PROVIDER="gemini"
   GEMINI_API_KEY="your_gemini_api_key_here"
   GEMINI_MODEL="gemini-2.5-flash"
   ```

---

## 5. Starting the Application (Two Running Modes)

### Mode A: Fast Single-Port Mode (Zero Node.js Required)
* **Best For:** Operators, analysts, or anyone who just wants to run and use the application without building frontend code.
* **How It Works:** FastAPI directly serves the pre-compiled React bundle (`frontend/dist/`) on port 8601.

**Steps (Requires Only 1 Terminal):**
```bash
# 1. Navigate to the project root
cd react_with_python_fast_api

# 2. Create and activate a Python virtual environment
python -m venv venv

# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Start the server
python -m uvicorn api.main:app --port 8601 --reload
```
Open your browser and navigate to: **`http://localhost:8601`**. Both the UI and backend APIs run seamlessly on this single port.

---

### Mode B: Full Developer Mode (React Hot-Reloading)
* **Best For:** Frontend engineers who want to edit React components with instant hot-reloading.

**Terminal 1 — FastAPI Backend:**
```bash
cd react_with_python_fast_api
venv\Scripts\activate
python -m uvicorn api.main:app --port 8601 --reload
```

**Terminal 2 — React Development Server:**
```bash
cd react_with_python_fast_api/frontend
npm install
npm run dev
```
Open your browser and navigate to: **`http://localhost:5173`**. Vite will automatically proxy `/api` requests to port 8601.

---

## 6. Verification Checklist

To confirm everything is operating properly:
1. **API Health Check:** Open `http://localhost:8601/api/health` in your browser. It should return `{"status":"ok", "cache":{...}}`.
2. **Settings API:** Open `http://localhost:8601/api/settings`. It should return your configured notebook name and default theme.
3. **UI Dashboard:** Open `http://localhost:8601/`. You should see the FinOps Command Center header, KPI cards, and sidebar navigation.

---

## 7. Troubleshooting Common Issues

* **`500 Internal Server Error` on startup:** Verify that your `DATABRICKS_HOST` includes `https://` and that your SQL Warehouse is started/running in Databricks.
* **`Table or view not found: system.billing.usage`:** System Tables are not enabled in your Databricks workspace. Request an Account Admin to enable System Tables under **Account Console > Settings > Feature Enablement**.
* **Frontend shows "Assets Not Built":** If running Mode A, verify that `frontend/dist/index.html` exists. If missing, navigate to `frontend/`, run `npm install`, then run `npm run build`.
* **Port in use error:** If port 8601 or 5173 is already in use by another application, specify another port (e.g., `--port 8602`).

