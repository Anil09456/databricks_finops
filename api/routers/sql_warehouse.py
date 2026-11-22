"""api/routers/sql_warehouse.py — SQL Warehouse dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.sql_warehouse import (
    get_warehouse_health, get_hourly_heatmap, get_top_expensive_queries,
    get_cache_trend, get_wh_classic_cost, get_wh_classic_daily,
    get_wh_serverless_cost, get_wh_serverless_daily,
    get_wh_idle_billing, get_repeat_query_kpi,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"sql_wh:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/health")
def warehouse_health(workspace_id: str | None = None):
    return _df(get_warehouse_health, "health", workspace_id)

@router.get("/heatmap")
def hourly_heatmap(workspace_id: str | None = None):
    return _df(get_hourly_heatmap, "heatmap", workspace_id)

@router.get("/top-queries")
def top_expensive_queries(workspace_id: str | None = None):
    return _df(get_top_expensive_queries, "top_queries", workspace_id)

@router.get("/cache-trend")
def cache_trend(workspace_id: str | None = None):
    return _df(get_cache_trend, "cache_trend", workspace_id)

@router.get("/classic/cost")
def classic_cost(workspace_id: str | None = None):
    return _df(get_wh_classic_cost, "classic_cost", workspace_id)

@router.get("/classic/daily")
def classic_daily(workspace_id: str | None = None):
    return _df(get_wh_classic_daily, "classic_daily", workspace_id)

@router.get("/serverless/cost")
def serverless_cost(workspace_id: str | None = None):
    return _df(get_wh_serverless_cost, "serverless_cost", workspace_id)

@router.get("/serverless/daily")
def serverless_daily(workspace_id: str | None = None):
    return _df(get_wh_serverless_daily, "serverless_daily", workspace_id)

@router.get("/idle-billing")
def idle_billing(workspace_id: str | None = None):
    return _df(get_wh_idle_billing, "idle_billing", workspace_id)

@router.get("/repeat-query-kpi")
def repeat_query_kpi(workspace_id: str | None = None):
    return _df(get_repeat_query_kpi, "repeat_query_kpi", workspace_id)
