"""
api/routers/run_intelligence.py
═══════════════════════════════════════════════════════════════════════════════
Run Intelligence Engine REST endpoints.
Wraps the existing log_processor/ module (unchanged).
"""
import sys
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

# Allow the log_processor from the PARENT project to be imported
# (it has no Streamlit dependency so this is safe)
_parent = Path(__file__).parent.parent.parent.parent  # FinOps_CoPilot_App_v1/
if str(_parent) not in sys.path:
    sys.path.insert(0, str(_parent))

from config.settings import DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request/Response models ───────────────────────────────────────────────────
class AnalyzeRunRequest(BaseModel):
    entity_type: str          # "job" | "pipeline"
    entity_id: str
    run_id: str
    entity_name: Optional[str] = ""
    baseline_type: Optional[str] = "Last Successful Run"
    baseline_run_id: Optional[str] = ""
    include_log_files: Optional[bool] = True
    include_cluster_events: Optional[bool] = True
    workload_type: Optional[str] = "Auto-detect"
    data_volume: Optional[str] = "Unknown"
    optimization_priorities: Optional[list] = []
    dlt_storage_location: Optional[str] = ""
    dlt_uc_table: Optional[str] = ""


class AIRequest(BaseModel):
    summary: dict
    optimization_priorities: Optional[list] = []
    workload_type: Optional[str] = "Auto-detect"
    data_volume: Optional[str] = "Unknown"


# ── Helpers ───────────────────────────────────────────────────────────────────
def _host():  return DATABRICKS_HOST.rstrip("/")
def _token(): return DATABRICKS_TOKEN
def _wh():    return DATABRICKS_WAREHOUSE_ID


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/jobs")
async def list_jobs(search: Optional[str] = None, workspace_id: Optional[str] = None, lookback_days: int = 30, max_jobs: int = 50):
    try:
        if search:
            from log_processor.run_intelligence.system_table_fetcher import search_recent_jobs
            return search_recent_jobs(search, _host(), _token(), _wh(),
                                     workspace_id=workspace_id, lookback_days=lookback_days, max_jobs=max_jobs)
        else:
            from log_processor.run_intelligence.system_table_fetcher import list_recent_jobs
            return list_recent_jobs(_host(), _token(), _wh(),
                                    lookback_days=lookback_days, max_jobs=max_jobs, workspace_id=workspace_id)
    except Exception as exc:
        logger.error(f"list_jobs error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/jobs/{job_id}/runs")
async def list_runs(job_id: str, workspace_id: Optional[str] = None, max_runs: int = 20):
    try:
        from log_processor.run_intelligence.system_table_fetcher import list_recent_runs_for_job
        return list_recent_runs_for_job(job_id, _host(), _token(), _wh(), max_runs=max_runs, workspace_id=workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pipelines")
async def list_pipelines(search: Optional[str] = None, workspace_id: Optional[str] = None, lookback_days: int = 30, max_pipelines: int = 30):
    try:
        if search:
            from log_processor.run_intelligence.system_table_fetcher import search_recent_pipelines
            return search_recent_pipelines(search, _host(), _token(), _wh(),
                                          workspace_id=workspace_id, lookback_days=lookback_days, max_pipelines=max_pipelines)
        else:
            from log_processor.run_intelligence.system_table_fetcher import list_recent_pipelines
            return list_recent_pipelines(_host(), _token(), _wh(),
                                         lookback_days=lookback_days, max_pipelines=max_pipelines, workspace_id=workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pipelines/{pipeline_id}/updates")
async def list_updates(pipeline_id: str, workspace_id: Optional[str] = None, max_updates: int = 20):
    try:
        from log_processor.run_intelligence.system_table_fetcher import list_recent_updates_for_pipeline
        return list_recent_updates_for_pipeline(pipeline_id, _host(), _token(), _wh(),
                                                max_updates=max_updates, workspace_id=workspace_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))



@router.post("/analyze")
async def analyze_run(req: AnalyzeRunRequest):
    """Full 3-source parallel analysis: system tables + event logs + driver logs."""
    import asyncio
    loop = asyncio.get_event_loop()

    def _run():
        system_data, event_data, log_data = {}, {}, {}

        # System tables
        try:
            if req.entity_type == "job":
                from log_processor.run_intelligence.system_table_fetcher import fetch_job_system_tables
                system_data = fetch_job_system_tables(
                    req.entity_id, req.run_id, _host(), _token(), _wh(),
                    baseline_type=req.baseline_type, baseline_run_id=req.baseline_run_id,
                )
            else:
                from log_processor.run_intelligence.system_table_fetcher import fetch_pipeline_system_tables
                system_data = fetch_pipeline_system_tables(
                    req.entity_id, req.run_id, _host(), _token(), _wh(),
                    baseline_type=req.baseline_type, baseline_run_id=req.baseline_run_id,
                )
        except Exception as exc:
            system_data = {"_error": str(exc)}

        # Event logs
        try:
            if req.include_cluster_events:
                if req.entity_type == "job":
                    from log_processor.run_intelligence.event_log_fetcher import fetch_job_run_output
                    event_data["job_run_output"] = fetch_job_run_output(req.run_id, _host(), _token())
                elif req.dlt_storage_location or req.dlt_uc_table:
                    from log_processor.run_intelligence.event_log_fetcher import fetch_dlt_event_log
                    event_data["dlt_events"] = fetch_dlt_event_log(
                        pipeline_id=req.entity_id, update_id=req.run_id,
                        storage_location=req.dlt_storage_location,
                        host=_host(), token=_token(), warehouse_id=_wh(),
                        use_named_table=bool(req.dlt_uc_table),
                        pipeline_name=req.dlt_uc_table,
                    )
        except Exception as exc:
            event_data["_error"] = str(exc)

        # Log files
        try:
            if req.include_log_files:
                from log_processor.run_intelligence.log_file_resolver import (
                    resolve_log_path, fetch_and_parse_log_files,
                )
                log_path = resolve_log_path(req.entity_type, req.entity_id, req.run_id)
                log_data = fetch_and_parse_log_files(log_path, _host(), _token())
        except Exception:
            log_data = {"_available": False}

        # Build summary
        from log_processor.run_intelligence.run_preprocessor import build_run_summary
        return build_run_summary(
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            run_id=req.run_id,
            entity_name=req.entity_name or "",
            system_data=system_data,
            event_data=event_data,
            log_data=log_data,
        )

    try:
        summary = await loop.run_in_executor(None, _run)
        # Convert non-serialisable objects
        import json
        summary_clean = json.loads(json.dumps(summary, default=str))
        return summary_clean
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/ai-recommendations")
async def ai_recommendations(req: AIRequest):
    try:
        from log_processor.run_intelligence.ai_engine import get_rie_ai_recommendations
        result = get_rie_ai_recommendations(
            req.summary,
            optimization_priorities=req.optimization_priorities,
            workload_type=req.workload_type,
            data_volume=req.data_volume,
        )
        import json
        return json.loads(json.dumps(result, default=str))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
