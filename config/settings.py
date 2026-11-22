"""
config/settings.py  (react_fast_api version)
══════════════════════════════════════════════════════════════════════════════
Identical env-var contract to the Streamlit version.
No Streamlit imports — pure Python / dotenv.
"""
import os
from pathlib import Path

# Load .env for local dev (no-op in Databricks Apps where env vars are injected)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

# ── Databricks connection ─────────────────────────────────────────────────────
DATABRICKS_HOST          = os.getenv("DATABRICKS_HOST", "")
DATABRICKS_WAREHOUSE_ID  = os.getenv("DATABRICKS_WAREHOUSE_ID", "")
DATABRICKS_TOKEN         = os.getenv("DATABRICKS_TOKEN", "")
DATABRICKS_CATALOG       = os.getenv("DATABRICKS_CATALOG", "system")
DATABRICKS_CLIENT_ID     = os.getenv("DATABRICKS_CLIENT_ID", "")
DATABRICKS_CLIENT_SECRET = os.getenv("DATABRICKS_CLIENT_SECRET", "")

# NOTE: No application-level query timeout is set here.
# Query execution timeout is managed at the Databricks SQL Warehouse level
# (Warehouse Settings > Query timeout). This prevents enterprise-scale queries
# on large system tables (hundreds of millions of rows) from being killed prematurely.
DATABRICKS_CACHE_TTL_SECONDS     = int(os.getenv("DATABRICKS_CACHE_TTL", "7200"))
DATABRICKS_POOL_SIZE             = int(os.getenv("DATABRICKS_POOL_SIZE", "8"))
# How long a thread waits for a free pool connection before giving up.
# Set high (300s) to allow long-running enterprise queries to finish without
# starving other threads during parallel refresh batches.
DATABRICKS_POOL_WAIT_TIMEOUT     = int(os.getenv("DATABRICKS_POOL_WAIT_TIMEOUT", "300"))


# ── Notebook reference ────────────────────────────────────────────────────────
NOTEBOOK_NAME           = os.getenv("NOTEBOOK_NAME", "FinOps DBX Developer Notebook")
NOTEBOOK_BTN_LABEL      = os.getenv("NOTEBOOK_BTN_LABEL", "Open Developer Notebook")
NOTEBOOK_ID             = os.getenv("NOTEBOOK_ID", "1561959874304159")
NOTEBOOK_WORKSPACE_PATH = os.getenv("NOTEBOOK_WORKSPACE_PATH", "/Workspace/Users/user_email/Hoonartek/FinOps_Databricks_FullDemo_v5-5")

_FALLBACK_NOTEBOOK_URL = os.getenv("NOTEBOOK_FALLBACK_URL", "https://databricks-prod-cloudfront.cloud.databricks.com/public/4027ec902e239c93eaaa8714f173bcfc/1561959874304000/notebook/0/dashboard")

def notebook_cell_url(cell_id: int) -> str:
    if DATABRICKS_HOST and NOTEBOOK_ID:
        return f"{DATABRICKS_HOST.rstrip('/')}/#notebook/{NOTEBOOK_ID}/command/{cell_id}"
    return f"{_FALLBACK_NOTEBOOK_URL}#command/{cell_id}"

def notebook_base_url() -> str:
    if DATABRICKS_HOST and NOTEBOOK_ID:
        return f"{DATABRICKS_HOST.rstrip('/')}/#notebook/{NOTEBOOK_ID}"
    return _FALLBACK_NOTEBOOK_URL

# ── LLM integration ───────────────────────────────────────────────────────────
LLM_PROVIDER    = os.getenv("LLM_PROVIDER", "gemini")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY",
                    os.getenv("DATABRICKS_SECRET_anthropic_api_key", ""))
ANTHROPIC_MODEL   = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL    = os.getenv("OPENAI_MODEL",   "gpt-4o")

GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL    = os.getenv("GEMINI_MODEL",   "gemini-2.5-flash")

def llm_is_configured() -> bool:
    if LLM_PROVIDER == "anthropic" and ANTHROPIC_API_KEY: return True
    if LLM_PROVIDER == "openai"    and OPENAI_API_KEY:    return True
    if LLM_PROVIDER == "gemini"    and GEMINI_API_KEY:    return True
    return False

# ── App behaviour ─────────────────────────────────────────────────────────────
APP_TITLE    = "FinOps Command Center"
APP_SUBTITLE = "Databricks Cost Intelligence · Proactive Insights"
APP_ICON     = "⚡"

DEFAULT_THEME = os.getenv("DEFAULT_THEME", "dark")

# CORS origins — for local dev only
CORS_ORIGINS = [o.strip() for o in
                os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
                if o.strip()]

