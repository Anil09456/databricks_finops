"""api/routers/dlt.py — Delta Live Tables dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.dlt_costs import (
    get_dlt_kpi, get_dlt_pipelines, get_dlt_daily,
    get_dlt_classic_pipelines, get_dlt_classic_daily, get_dlt_classic_kpi,
    get_dlt_serverless_pipelines, get_dlt_serverless_daily, get_dlt_serverless_kpi,
    get_dlt_pipeline_health, get_dlt_health_kpi,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"dlt:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/kpi")
def kpi(workspace_id: str | None = None):
    return _df(get_dlt_kpi, "kpi", workspace_id)

@router.get("/pipelines")
def pipelines(workspace_id: str | None = None):
    return _df(get_dlt_pipelines, "pipelines", workspace_id)

@router.get("/daily")
def daily(workspace_id: str | None = None):
    return _df(get_dlt_daily, "daily", workspace_id)

@router.get("/classic/kpi")
def classic_kpi(workspace_id: str | None = None):
    return _df(get_dlt_classic_kpi, "classic_kpi", workspace_id)

@router.get("/classic/pipelines")
def classic_pipelines(workspace_id: str | None = None):
    return _df(get_dlt_classic_pipelines, "classic_pipelines", workspace_id)

@router.get("/classic/daily")
def classic_daily(workspace_id: str | None = None):
    return _df(get_dlt_classic_daily, "classic_daily", workspace_id)

@router.get("/serverless/kpi")
def serverless_kpi(workspace_id: str | None = None):
    return _df(get_dlt_serverless_kpi, "serverless_kpi", workspace_id)

@router.get("/serverless/pipelines")
def serverless_pipelines(workspace_id: str | None = None):
    return _df(get_dlt_serverless_pipelines, "serverless_pipelines", workspace_id)

@router.get("/serverless/daily")
def serverless_daily(workspace_id: str | None = None):
    return _df(get_dlt_serverless_daily, "serverless_daily", workspace_id)

@router.get("/pipeline-health")
def pipeline_health(workspace_id: str | None = None):
    return _df(get_dlt_pipeline_health, "pipeline_health", workspace_id)

@router.get("/health-kpi")
def health_kpi(workspace_id: str | None = None):
    return _df(get_dlt_health_kpi, "health_kpi", workspace_id)
