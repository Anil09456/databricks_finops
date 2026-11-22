"""
api/main.py
════════════════════════════════════════════════════════════════════════════
FastAPI application entry point.

On startup:
  - Establishes Databricks SQL connection (warm)
  - Mounts all dashboard routers under /api

In production (Databricks Apps):
  - Serves built React bundle from frontend/dist/ at /

Local dev:
  - React dev server (npm run dev) proxies /api → port 8080
"""
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure react_fast_api is at the front of python path to avoid root import conflicts
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config.settings import CORS_ORIGINS
from api.routers import (
    overall, interactive, jobs, sql_warehouse,
    dlt, storage, chargeback, query_intelligence,
    merge_health, run_intelligence, lookup, analyze, cache_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: pre-warm connection in background to avoid blocking server bind ─
    logger.info("FinOps Copilot API starting up…")
    
    def pre_warm():
        try:
            from data.db import get_connection
            conn = get_connection()
            if conn:
                logger.info("Databricks SQL connection ready.")
                # Trigger cache warming
                from data.db import refresh_all_caches
                import api.cache as _cache
                refresh_all_caches(_cache._store)
            else:
                logger.warning("Databricks connection not established — check credentials.")
        except Exception as exc:
            logger.error(f"Startup connection error: {exc}")

    import threading
    threading.Thread(target=pre_warm, daemon=True).start()
    yield
    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("FinOps Copilot API shutting down.")


app = FastAPI(
    title="FinOps Copilot API",
    description="Databricks Cost Intelligence — React + FastAPI backend",
    version="1.1.0",
    lifespan=lifespan,
)

# ── CORS (for local dev; in Databricks Apps React is served from same origin) ─
if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ── API routers ───────────────────────────────────────────────────────────────
app.include_router(overall.router,            prefix="/api/overall",            tags=["Overall"])
app.include_router(interactive.router,        prefix="/api/interactive",        tags=["Interactive"])
app.include_router(jobs.router,               prefix="/api/jobs",               tags=["Jobs"])
app.include_router(sql_warehouse.router,      prefix="/api/sql-warehouse",      tags=["SQL Warehouse"])
app.include_router(dlt.router,                prefix="/api/dlt",                tags=["DLT"])
app.include_router(storage.router,            prefix="/api/storage",            tags=["Storage"])
app.include_router(chargeback.router,         prefix="/api/chargeback",         tags=["Chargeback"])
app.include_router(query_intelligence.router, prefix="/api/query-intelligence", tags=["Query Intelligence"])
app.include_router(merge_health.router,       prefix="/api/merge",              tags=["Merge & Clustering"])
app.include_router(run_intelligence.router,   prefix="/api/run-intelligence",   tags=["Run Intelligence"])
app.include_router(lookup.router,             prefix="/api/lookup",             tags=["Lookup"])
app.include_router(analyze.router,            prefix="/api/analyze",            tags=["Analyze"])
app.include_router(cache_router.router,       prefix="/api/cache",              tags=["Cache"])


@app.get("/api/health")
async def health():
    from api.cache import stats
    return {"status": "ok", "cache": stats()}


@app.get("/api/settings")
async def get_settings():
    from config.settings import DEFAULT_THEME, APP_TITLE, APP_SUBTITLE, APP_ICON, notebook_base_url, NOTEBOOK_NAME, NOTEBOOK_BTN_LABEL
    return {
        "default_theme": DEFAULT_THEME,
        "app_title": APP_TITLE,
        "app_subtitle": APP_SUBTITLE,
        "app_icon": APP_ICON,
        "notebook_url": notebook_base_url(),
        "notebook_name": NOTEBOOK_NAME,
        "notebook_btn_label": NOTEBOOK_BTN_LABEL
    }


# ── Serve React build (production) ────────────────────────────────────────────
_DIST = Path(__file__).parent.parent / "frontend" / "dist"

# Ensure the assets directory exists so we can mount it unconditionally
(_DIST / "assets").mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Catch-all: serve index.html for any non-API route (SPA routing)."""
    index = _DIST / "index.html"
    if index.exists():
        return FileResponse(str(index))
    from fastapi.responses import HTMLResponse
    return HTMLResponse(
        content=r"""
        <html>
        <head>
            <title>FinOps Copilot App</title>
            <style>
                body {
                    font-family: 'Segoe UI', system-ui, sans-serif;
                    background: #0a0e1a;
                    color: #e2e8f0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    text-align: center;
                    border: 1px solid #1e2d42;
                    padding: 40px;
                    border-radius: 12px;
                    background: #111827;
                    max-width: 600px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                }
                h1 { color: #00d4ff; margin-bottom: 12px; font-size: 28px; }
                p { color: #8892a4; line-height: 1.6; margin-bottom: 24px; font-size: 14px; }
                .code-box {
                    text-align: left;
                    background: #0d1220;
                    padding: 20px;
                    border-radius: 8px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 13px;
                    border: 1px solid #1e2d42;
                    color: #b388ff;
                    line-height: 1.5;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>⚡ Frontend Assets Not Built</h1>
                <p>The FastAPI backend server is running successfully on port 8601, but the React frontend files have not been compiled into <code>frontend/dist</code>.</p>
                <div class="code-box">
                    # To build the frontend, open your terminal and run:<br>
                    <span style="color: #8892a4;">cd</span> c:\Users\dell\Downloads\FinOps_CoPilot_App_v1\react_with_python_fast_api\frontend<br>
                    <span style="color: #8892a4;">npm</span> install<br>
                    <span style="color: #8892a4;">npm</span> run build
                </div>
            </div>
        </body>
        </html>
        """,
        status_code=200
    )
