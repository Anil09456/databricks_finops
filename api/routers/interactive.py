"""api/routers/interactive.py — Interactive Computes dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.all_purpose import (
    get_ap_classic_kpi, get_ap_classic_clusters, get_ap_classic_daily,
    get_ap_serverless_kpi, get_ap_serverless_daily, get_ap_session_scan,
    get_ap_kpi, get_ap_clusters, get_ap_daily,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"interactive:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/classic/kpi")
def classic_kpi(workspace_id: str | None = None):
    return _df(get_ap_classic_kpi, "classic_kpi", workspace_id)

@router.get("/classic/clusters")
def classic_clusters(workspace_id: str | None = None):
    return _df(get_ap_classic_clusters, "classic_clusters", workspace_id)

@router.get("/classic/daily")
def classic_daily(workspace_id: str | None = None):
    return _df(get_ap_classic_daily, "classic_daily", workspace_id)

@router.get("/serverless/kpi")
def serverless_kpi(workspace_id: str | None = None):
    return _df(get_ap_serverless_kpi, "serverless_kpi", workspace_id)

@router.get("/serverless/daily")
def serverless_daily(workspace_id: str | None = None):
    return _df(get_ap_serverless_daily, "serverless_daily", workspace_id)

@router.get("/session-scan")
def session_scan(workspace_id: str | None = None):
    return _df(get_ap_session_scan, "session_scan", workspace_id)

@router.get("/kpi")
def combined_kpi(workspace_id: str | None = None):
    return _df(get_ap_kpi, "kpi", workspace_id)
