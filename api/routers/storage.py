"""api/routers/storage.py — Storage Health dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.storage_health import (
    get_storage_cost_trend, get_table_sizes, get_zombie_risk,
    get_storage_kpi, get_vacuum_compliance, get_retain0_kpi,
    get_user_cost_leaderboard,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"storage:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/cost-trend")
def cost_trend(workspace_id: str | None = None):
    return _df(get_storage_cost_trend, "cost_trend", workspace_id)

@router.get("/table-sizes")
def table_sizes(workspace_id: str | None = None):
    return _df(get_table_sizes, "table_sizes", workspace_id)

@router.get("/zombie-risk")
def zombie_risk(workspace_id: str | None = None):
    return _df(get_zombie_risk, "zombie_risk", workspace_id)

@router.get("/kpi")
def storage_kpi(workspace_id: str | None = None):
    return _df(get_storage_kpi, "kpi", workspace_id)

@router.get("/vacuum-compliance")
def vacuum_compliance(workspace_id: str | None = None):
    return _df(get_vacuum_compliance, "vacuum_compliance", workspace_id)

@router.get("/retain0-kpi")
def retain0_kpi(workspace_id: str | None = None):
    return _df(get_retain0_kpi, "retain0_kpi", workspace_id)

@router.get("/user-cost-leaderboard")
def user_cost_leaderboard(workspace_id: str | None = None):
    return _df(get_user_cost_leaderboard, "user_cost_leaderboard", workspace_id)
