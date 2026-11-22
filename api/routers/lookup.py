"""api/routers/lookup.py — Cost & DBU Lookup endpoints."""
from fastapi import APIRouter
from api.cache import clean_df
from data.queries.cost_lookup import (
    lookup_job, lookup_pipeline, lookup_cluster,
    lookup_warehouse, lookup_user, lookup_notebook,
)

router = APIRouter()

def _records(df):
    return clean_df(df)

@router.get("/job")
def job(search: str, days: int = 30, workspace_id: str | None = None):
    detail_df, summary_df = lookup_job(search, days, workspace_id)
    return {
        "detail": _records(detail_df),
        "summary": _records(summary_df)
    }

@router.get("/pipeline")
def pipeline(search: str, days: int = 30, workspace_id: str | None = None):
    detail_df, summary_df = lookup_pipeline(search, days, workspace_id)
    return {
        "detail": _records(detail_df),
        "summary": _records(summary_df)
    }

@router.get("/cluster")
def cluster(search: str, days: int = 30, workspace_id: str | None = None):
    detail_df, summary_df = lookup_cluster(search, days, workspace_id)
    return {
        "detail": _records(detail_df),
        "summary": _records(summary_df)
    }

@router.get("/warehouse")
def warehouse(search: str, days: int = 30, workspace_id: str | None = None):
    cost_detail_df, summary_df, stats_df = lookup_warehouse(search, days, workspace_id)
    return {
        "cost_detail": _records(cost_detail_df),
        "summary": _records(summary_df),
        "stats": _records(stats_df)
    }

@router.get("/user")
def user(search: str, days: int = 30, workspace_id: str | None = None):
    cost_detail_df, summary_df, stats_df = lookup_user(search, days, workspace_id)
    return {
        "cost_detail": _records(cost_detail_df),
        "summary": _records(summary_df),
        "stats": _records(stats_df)
    }

@router.get("/notebook")
def notebook(search: str, days: int = 30, workspace_id: str | None = None):
    df = lookup_notebook(search, days, workspace_id)
    return {
        "detail": _records(df)
    }

