"""
log_processor/run_intelligence/log_file_resolver.py
══════════════════════════════════════════════════════════════════════════════
Resolves and verifies the Volume log path for a job run or pipeline update.

Steps:
  1. Construct the deterministic path from (job_id, run_id) using the
     helper from config.run_intelligence_settings.
  2. Query the Databricks Files API to check which log files exist.
  3. If files exist, read them and pass to the existing DriverLogPreprocessor.
  4. Return a standardised availability map + parsed log signals.

The path formula:
  /Volumes/<catalog>/<schema>/<volume>/jobs/<job_id>/run_<run_id>/
  /Volumes/<catalog>/<schema>/<volume>/pipelines/<pipeline_id>/update_<update_id>/
══════════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)


def resolve_log_path(
    entity_type: str,   # "job" | "pipeline"
    entity_id: str,
    run_id: str,
) -> str:
    """
    Return the deterministic Volume path for a run's log folder.
    Uses helper functions from run_intelligence_settings (no hard-coded paths).
    """
    from config.run_intelligence_settings import get_job_log_path, get_pipeline_log_path

    if entity_type == "job":
        return get_job_log_path(entity_id, run_id)
    elif entity_type == "pipeline":
        return get_pipeline_log_path(entity_id, run_id)
    else:
        raise ValueError(f"Unknown entity_type: {entity_type!r}")


def check_log_files(
    log_path: str,
    host: str,
    token: str,
) -> dict[str, Any]:
    """
    Check which log files exist in a Volume folder using the Files API.

    Args:
        log_path:  Absolute Volume path (e.g. /Volumes/main/finops/finops_logs/jobs/123/run_456)
        host:      Databricks workspace URL
        token:     Access token

    Returns a dict:
        exists          – bool: True if the folder exists at all
        has_metadata    – bool
        has_stderr      – bool
        has_stdout      – bool
        has_log4j       – bool
        files           – list of file names found
        log_path        – the path that was checked
    """
    from config.run_intelligence_settings import RIE_LOG_FILE_NAMES

    result: dict[str, Any] = {
        "exists":       False,
        "has_metadata": False,
        "has_stderr":   False,
        "has_stdout":   False,
        "has_log4j":    False,
        "files":        [],
        "log_path":     log_path,
    }

    try:
        url = f"{host.rstrip('/')}/api/2.0/fs/list"
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(url, params={"path": log_path}, headers=headers, timeout=15)

        if resp.status_code == 404:
            return result  # folder not found

        resp.raise_for_status()
        files = {f["name"] for f in resp.json().get("files", [])}
        result["exists"] = True
        result["files"]  = sorted(files)

        result["has_metadata"] = bool(files & set(RIE_LOG_FILE_NAMES["metadata"]))
        result["has_stderr"]   = bool(files & set(RIE_LOG_FILE_NAMES["stderr"]))
        result["has_stdout"]   = bool(files & set(RIE_LOG_FILE_NAMES["stdout"]))
        result["has_log4j"]    = bool(files & set(RIE_LOG_FILE_NAMES["log4j"]))

    except requests.RequestException as e:
        logger.warning(f"[log_file_resolver] Files API error for {log_path}: {e}")

    return result


def read_log_metadata(
    log_path: str,
    host: str,
    token: str,
) -> dict:
    """
    Download and parse run_metadata.json from a Volume folder.
    Returns the metadata dict, or {} if not found or invalid.
    """
    metadata_url = f"{host.rstrip('/')}/api/2.0/fs/files"
    file_path = f"{log_path}/run_metadata.json"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        resp = requests.get(metadata_url, params={"path": file_path},
                            headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning(f"[log_file_resolver] Could not read run_metadata.json: {e}")

    return {}


def fetch_and_parse_log_files(
    log_path: str,
    host: str,
    token: str,
    context: dict | None = None,
) -> dict[str, Any]:
    """
    Download log files from the Volume path and run them through the existing
    DriverLogPreprocessor.

    Returns the preprocessor output dict with an added _source="volume" key.
    If logs are not available, returns a minimal dict with _available=False.
    """
    from config.run_intelligence_settings import RIE_MAX_LOG_LINES, RIE_LOG_FILE_NAMES

    availability = check_log_files(log_path, host, token)

    if not availability["exists"]:
        return {"_available": False, "_log_path": log_path, "signals": [], "health": {"score": None, "flags": {}}}

    # Download files to a temporary directory and run the preprocessor
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        _downloaded_any = False

        for key, candidates in RIE_LOG_FILE_NAMES.items():
            if key == "metadata":
                continue  # handled separately
            for candidate in candidates:
                remote_path = f"{log_path}/{candidate}"
                local_path = tmp_path / candidate
                if _download_file(remote_path, local_path, host, token):
                    _downloaded_any = True
                    break  # got this log type, move to next

        if not _downloaded_any:
            return {"_available": False, "_log_path": log_path, "signals": [], "health": {"score": None, "flags": {}}}

        # Read metadata if present
        metadata = read_log_metadata(log_path, host, token)

        # Merge context with run metadata
        merged_context = {**(context or {}), **metadata}

        # Run through existing DriverLogPreprocessor
        try:
            from log_processor.preprocessor import DriverLogPreprocessor
            preprocessor = DriverLogPreprocessor(
                driver_log_dir=str(tmp_path),
                context=merged_context,
                max_lines=RIE_MAX_LOG_LINES,
            )
            result = preprocessor.process()
            result["_available"] = True
            result["_source"]    = "volume"
            result["_log_path"]  = log_path
            result["_files"]     = availability["files"]
            return result
        except Exception as e:
            logger.error(f"[log_file_resolver] DriverLogPreprocessor failed: {e}")
            return {
                "_available": False,
                "_error":     str(e),
                "_log_path":  log_path,
                "signals":    [],
                "health":     {"score": None, "flags": {}},
            }


def _download_file(remote_path: str, local_path: Path, host: str, token: str) -> bool:
    """Download a file from the Databricks Files API to local_path. Returns True on success."""
    url = f"{host.rstrip('/')}/api/2.0/fs/files"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        resp = requests.get(url, params={"path": remote_path}, headers=headers,
                            stream=True, timeout=30)
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
        return True
    except Exception as e:
        logger.debug(f"[log_file_resolver] download {remote_path}: {e}")
        return False
