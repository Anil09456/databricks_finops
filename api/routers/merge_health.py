"""api/routers/merge_health.py — MERGE & Clustering dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.merge_health import (
    get_merge_kpi, get_merge_trend, get_lc_candidates,
    get_write_amplification, get_pyspark_write_audit,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"merge:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/kpi")
def kpi(workspace_id: str | None = None):
    return _df(get_merge_kpi, "kpi", workspace_id)

@router.get("/trend")
def merge_trend(workspace_id: str | None = None):
    return _df(get_merge_trend, "trend", workspace_id)

@router.get("/lc-candidates")
def lc_candidates(workspace_id: str | None = None):
    return _df(get_lc_candidates, "lc_candidates", workspace_id)

@router.get("/write-amplification")
def write_amplification(workspace_id: str | None = None):
    return _df(get_write_amplification, "write_amp", workspace_id)

@router.get("/pyspark-write-audit")
def pyspark_write_audit(workspace_id: str | None = None):
    return _df(get_pyspark_write_audit, "pyspark_write_audit", workspace_id)
