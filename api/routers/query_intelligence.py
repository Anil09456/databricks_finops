"""api/routers/query_intelligence.py — Query Intelligence dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.query_intelligence import (
    get_qi_kpi, get_spill_events, get_spill_kpi,
    get_repeat_queries, get_cache_breaker_users, get_shuffle_ratio,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"qi:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/kpi")
def kpi(workspace_id: str | None = None):
    return _df(get_qi_kpi, "kpi", workspace_id)

@router.get("/spill-events")
def spill_events(workspace_id: str | None = None):
    return _df(get_spill_events, "spill_events", workspace_id)

@router.get("/spill-kpi")
def spill_kpi(workspace_id: str | None = None):
    return _df(get_spill_kpi, "spill_kpi", workspace_id)

@router.get("/repeat-queries")
def repeat_queries(workspace_id: str | None = None):
    return _df(get_repeat_queries, "repeat_queries", workspace_id)

@router.get("/cache-breaker-users")
def cache_breaker_users(workspace_id: str | None = None):
    return _df(get_cache_breaker_users, "cache_breaker_users", workspace_id)

@router.get("/shuffle-ratio")
def shuffle_ratio(workspace_id: str | None = None):
    return _df(get_shuffle_ratio, "shuffle_ratio", workspace_id)
