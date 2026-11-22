"""api/routers/jobs.py — Jobs Compute dashboard endpoints."""
from fastapi import APIRouter
from api.cache import cached, clean_df
from data.queries.job_costs import (
    get_job_classic_kpi, get_job_classic_top, get_job_classic_daily,
    get_job_serverless_kpi, get_job_serverless_top, get_job_serverless_daily,
    get_job_failed_cost, get_job_weekly_trend,
    get_top_jobs, get_job_daily_cost, get_job_wow_change,
)

router = APIRouter()

def _df(fn, key, workspace_id: str | None = None):
    cache_key = f"jobs:{key}:{workspace_id or 'all'}"
    return clean_df(cached(cache_key, lambda: fn(workspace_id=workspace_id)))

@router.get("/classic/kpi")
def classic_kpi(workspace_id: str | None = None):
    return _df(get_job_classic_kpi, "classic_kpi", workspace_id)

@router.get("/classic/top")
def classic_top(workspace_id: str | None = None):
    return _df(get_job_classic_top, "classic_top", workspace_id)

@router.get("/classic/daily")
def classic_daily(workspace_id: str | None = None):
    return _df(get_job_classic_daily, "classic_daily", workspace_id)

@router.get("/serverless/kpi")
def serverless_kpi(workspace_id: str | None = None):
    return _df(get_job_serverless_kpi, "serverless_kpi", workspace_id)

@router.get("/serverless/top")
def serverless_top(workspace_id: str | None = None):
    return _df(get_job_serverless_top, "serverless_top", workspace_id)

@router.get("/serverless/daily")
def serverless_daily(workspace_id: str | None = None):
    return _df(get_job_serverless_daily, "serverless_daily", workspace_id)

@router.get("/failed-cost")
def failed_cost(workspace_id: str | None = None):
    return _df(get_job_failed_cost, "failed_cost", workspace_id)

@router.get("/weekly-trend")
def weekly_trend(workspace_id: str | None = None):
    return _df(get_job_weekly_trend, "weekly_trend", workspace_id)
