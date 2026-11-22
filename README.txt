================================================================================
FINOPS COPILOT APP — DATABRICKS COST INTELLIGENCE
================================================================================

An enterprise-grade Financial Operations (FinOps) and workload optimization
application built specifically for Databricks.

--------------------------------------------------------------------------------
1. END-TO-END SYSTEM ARCHITECTURE
--------------------------------------------------------------------------------

[ REACT FRONTEND (SPA) ]
  - Vite + React 18
  - Interactive Cost Dashboards & Recharts
  - Located in: frontend/
           │
           │ REST API Calls (/api/*)
           ▼
[ FASTAPI BACKEND (Python) ]
  - Python 3.10+ & Uvicorn ASGI Server
  - In-Memory Caching & Connection Pool Management
  - Located in: api/ & config/
           │
           ├──────────────────────────────────────┐
           ▼                                      ▼
[ DATABRICKS SYSTEM TABLES ]             [ LLM RECOMMENDATIONS ENGINE ]
  - system.billing.*                       - Google Gemini / Anthropic Claude
  - system.compute.*                       - 6-Dimension AI Optimization Advice
  - system.lakeflow.* & system.query.*     - Located in: log_processor/

--------------------------------------------------------------------------------
2. SYSTEM & SOFTWARE PREREQUISITES
--------------------------------------------------------------------------------

Before setting up or hosting on any machine or laptop:

1. Python 3.10 or 3.12+ (For FastAPI backend server & Databricks connector)
2. Node.js v18.0.0+ & npm v9.0.0+ (For React frontend build system)
3. Git (Code repository access)
4. Databricks Workspace Access (Unity Catalog enabled with System Tables access)

--------------------------------------------------------------------------------
3. STEP-BY-STEP SETUP GUIDE FOR A NEW MACHINE / LAPTOP
--------------------------------------------------------------------------------

STEP 1: Open Terminal & Navigate to Project Directory
  cd finops/FinOps_CoPilot_App_v1/react_with_python_fast_api

STEP 2: Create Environment Configuration (.env)
  Copy .env.example to .env in the root folder and fill in Databricks credentials:
  
  DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
  DATABRICKS_WAREHOUSE_ID=your_sql_warehouse_id
  DATABRICKS_TOKEN=dapi_your_personal_access_token
  DATABRICKS_CATALOG=system
  GEMINI_API_KEY=your_gemini_key (Optional)
  CORS_ORIGINS=http://localhost:5173,http://localhost:3000

STEP 3: Install Backend Python Packages
  python -m venv venv
  .\venv\Scripts\Activate.ps1   (Windows PowerShell)
  pip install -r requirements.txt

STEP 4: Install Frontend Node Packages
  cd frontend
  npm install

--------------------------------------------------------------------------------
4. HOW TO RUN THE APPLICATION
--------------------------------------------------------------------------------

OPTION A: Local Development Mode (Two Terminals)

  Terminal 1 (Backend):
    python -m uvicorn api.main:app --host 127.0.0.1 --port 8601 --reload

  Terminal 2 (Frontend):
    cd frontend
    npm run dev

  Access via Browser: http://localhost:5173

OPTION B: Production Single-Server Mode (Single Terminal)

  Step 1: Compile React Frontend Assets
    cd frontend
    npm run build
    cd ..

  Step 2: Start Unified FastAPI Server
    python -m uvicorn api.main:app --host 0.0.0.0 --port 8601

  Access via Browser: http://localhost:8601

OPTION C: Databricks Apps (Cloud Production Hosting)

  databricks apps deploy finops-copilot

--------------------------------------------------------------------------------
5. PROJECT DIRECTORY STRUCTURE
--------------------------------------------------------------------------------

react_with_python_fast_api/
├── .env                    # Local environment variables (Databricks tokens)
├── .env.example            # Environment variables template
├── app.yaml                # Databricks Apps deployment manifest
├── README.md               # Markdown documentation & setup guide
├── README.txt              # Plain text documentation & setup guide
├── requirements.txt        # Python backend dependencies
├── api/                    # FastAPI entry point & domain routers
├── config/                 # Application settings & credentials loader
├── data/                   # Databricks SQL queries & db connector
├── log_processor/          # Run Intelligence Engine & LLM processor
├── frontend/               # React source code & npm dependencies
└── documentation/          # System design documents & references
================================================================================
