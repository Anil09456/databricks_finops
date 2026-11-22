"""api/routers/chargeback.py — Tagging & Chargeback dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.chargeback import get_team_spend, get_tag_coverage, get_chargeback_kpis

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"chargeback:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/team-spend")
def team_spend(workspace_id: str | None = None):
    return _df(get_team_spend, "team_spend", workspace_id)

@router.get("/tag-coverage")
def tag_coverage(workspace_id: str | None = None):
    return _df(get_tag_coverage, "tag_coverage", workspace_id)

@router.get("/kpis")
def chargeback_kpis(workspace_id: str | None = None):
    from api.cache import get, set as cache_set
    cache_key = f"chargeback:kpis:{workspace_id or 'all'}"
    cached_kpis = get(cache_key)
    if cached_kpis is not None:
        return cached_kpis
    team_df  = cached(f"chargeback:team_spend:{workspace_id or 'all'}", lambda: get_team_spend(workspace_id=workspace_id))
    tag_df   = cached(f"chargeback:tag_coverage:{workspace_id or 'all'}", lambda: get_tag_coverage(workspace_id=workspace_id))
    if team_df is None:
        return {}
    kpis = get_chargeback_kpis(team_df, tag_df if tag_df is not None else __import__('pandas').DataFrame())
    cache_set(cache_key, kpis)
    return kpis
