"""api/routers/cache_router.py — Cache management endpoints."""
from fastapi import APIRouter
from api.cache import invalidate_section, clear_all, stats
from data.db import refresh_all_caches
import api.cache as _cache

router = APIRouter()

@router.delete("/{section}")
async def clear_section(section: str):
    """Invalidate cache for a specific dashboard section. Triggers UI refresh."""
    n = invalidate_section(section)
    return {"section": section, "invalidated": n}

@router.delete("")
async def clear_all_cache():
    """Clear all cached data."""
    n = clear_all()
    return {"cleared": n}

@router.post("/refresh")
async def refresh_all():
    """
    Parallel warm-up of all 60+ queries.
    Previously ~15-25 minutes sequential → now ~4-5 minutes parallel.
    """
    clear_all()
    # Run in a thread pool so the endpoint returns quickly
    import asyncio
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, lambda: refresh_all_caches(_cache._store))
    return {"status": "refreshed", "cache": stats()}

@router.get("/stats")
async def cache_stats():
    return stats()
