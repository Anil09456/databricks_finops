"""
api/cache.py
════════════════════════════════════════════════════════════════════════════
In-memory TTL cache replacing @st.cache_data.
Thread-safe. Per-section invalidation via section key.
TTL defaults to DATABRICKS_CACHE_TTL_SECONDS (7200 s = 2 hours).
"""
import time
import threading
import logging
from typing import Any

from config.settings import DATABRICKS_CACHE_TTL_SECONDS

logger = logging.getLogger(__name__)

_lock  = threading.Lock()
_store: dict[str, dict] = {}   # key → {value, expires_at}


def get(key: str, allow_expired: bool = False) -> Any | None:
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        is_expired = time.time() > entry["expires_at"]
        if is_expired:
            # If it is extremely expired (more than 7 days), prune it
            if time.time() > entry["expires_at"] + 7 * 86400:
                del _store[key]
                return None
            if not allow_expired:
                return None
        return entry["value"]


def set(key: str, value: Any, ttl: int | None = None) -> None:
    ttl = ttl or DATABRICKS_CACHE_TTL_SECONDS
    with _lock:
        _store[key] = {"value": value, "expires_at": time.time() + ttl}


def invalidate_section(section: str) -> int:
    """Delete all keys that start with '{section}:'. Returns count deleted."""
    prefix = f"{section}:"
    with _lock:
        keys = [k for k in _store if k.startswith(prefix)]
        for k in keys:
            del _store[k]
    logger.info(f"Cache: invalidated {len(keys)} keys for section '{section}'")
    return len(keys)


def clear_all() -> int:
    with _lock:
        n = len(_store)
        _store.clear()
    logger.info(f"Cache: cleared all {n} entries")
    return n


def stats() -> dict:
    now = time.time()
    with _lock:
        total  = len(_store)
        valid  = sum(1 for e in _store.values() if e["expires_at"] > now)
        expired = total - valid
    return {"total": total, "valid": valid, "expired": expired}


def cached(key: str, fn, ttl: int | None = None) -> Any:
    """Get from cache or call fn() and store result. If fn() fails, fallback to stale cache if present."""
    val = get(key)
    if val is not None:
        return val
    try:
        val = fn()
        if val is not None:
            set(key, val, ttl)
        return val
    except Exception as exc:
        logger.warning(f"Cache: query execution failed for key '{key}': {exc}. Checking for stale fallback...")
        stale_val = get(key, allow_expired=True)
        if stale_val is not None:
            logger.info(f"Cache: successfully fell back to stale value for key '{key}'")
            return stale_val
        raise exc


def clean_df(df: Any) -> list:
    """Safely convert a pandas DataFrame to JSON-serializable records with no NaNs."""
    import pandas as pd
    if df is None or (isinstance(df, pd.DataFrame) and df.empty):
        return []
    if not isinstance(df, pd.DataFrame):
        return df
    # Cast to object and replace all NaN/NaT with None so that they are JSON compliant
    return df.astype(object).where(pd.notnull(df), None).to_dict(orient="records")

