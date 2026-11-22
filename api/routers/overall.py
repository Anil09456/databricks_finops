"""api/routers/overall.py — Overall Usage & Cost dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df

from data.queries.usage_overview import (
    get_usage_kpi, get_daily_trend, get_sku_breakdown,
    get_cost_anomaly, get_workspace_cost, get_sku_wow,
    get_workspaces,
)
from data.queries.sql_warehouse import get_warehouse_health
from data.queries.chargeback import get_tag_coverage
from data.queries.storage_health import get_zombie_risk

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"overall:{key}:{workspace_id or 'all'}"
    if fn == get_workspaces:
        return clean_df(cached(cache_key, fn))
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/kpi")
def kpi(workspace_id: str | None = None):
    return _df(get_usage_kpi, "kpi", workspace_id)

@router.get("/trend")
def trend(workspace_id: str | None = None):
    return _df(get_daily_trend, "trend", workspace_id)

@router.get("/sku-breakdown")
def sku_breakdown(workspace_id: str | None = None):
    return _df(get_sku_breakdown, "sku_breakdown", workspace_id)

@router.get("/anomaly")
def anomaly(workspace_id: str | None = None):
    return _df(get_cost_anomaly, "anomaly", workspace_id)

@router.get("/workspace-cost")
def workspace_cost(workspace_id: str | None = None):
    return _df(get_workspace_cost, "workspace_cost", workspace_id)

@router.get("/sku-wow")
def sku_wow(workspace_id: str | None = None):
    return _df(get_sku_wow, "sku_wow", workspace_id)

@router.get("/warehouse-health")
def warehouse_health(workspace_id: str | None = None):
    return _df(get_warehouse_health, "warehouse_health", workspace_id)

@router.get("/tag-coverage")
def tag_coverage(workspace_id: str | None = None):
    return _df(get_tag_coverage, "tag_coverage", workspace_id)

@router.get("/zombie-risk")
def zombie_risk(workspace_id: str | None = None):
    return _df(get_zombie_risk, "zombie_risk", workspace_id)


@router.get("/workspaces")
def workspaces():
    return _df(get_workspaces, "workspaces")

