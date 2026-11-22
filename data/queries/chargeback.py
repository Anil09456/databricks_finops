"""
data/queries/chargeback.py
════════════════════════════════════════════════════════════════════════════
Queries for the Chargeback & Cost Attribution dashboard.

System tables used:
  • system.billing.usage        — cost source
  • system.compute.clusters     — cluster tags (team, project, environment)

Performance thresholds (basis for "Analyze Issue"):
  • Untagged spend > 10%      → Module 19 (Right-Sizing & Cluster Config / Tagging)
  • Any team > 150% of budget → Module 18 (System Tables) budget alert
  • Tagging coverage < 80%    → Module 19 D1
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_chargeback
# ── 1. Team spend breakdown (30 days) ────────────────────────────────────────
TEAM_SPEND_SQL = """
SELECT
  COALESCE(u.custom_tags['team'], '⚠️ UNTAGGED')   AS team,
  COALESCE(u.custom_tags['project'], 'unknown')     AS project,
  COALESCE(u.custom_tags['environment'], 'unknown') AS environment,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_usd,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)) * 3, 2) AS quarterly_projection
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY 1, 2, 3
ORDER BY cost_usd DESC
"""

def get_team_spend(workspace_id: str | None = None) -> pd.DataFrame:
    sql = TEAM_SPEND_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_chargeback(sql)

# ── 2. Tagging coverage by cluster ───────────────────────────────────────────
TAG_COVERAGE_SQL = """
SELECT
  usage_metadata.cluster_id AS cluster_id,
  'Cluster ' || usage_metadata.cluster_id AS cluster_name,
  CASE WHEN MAX(CASE WHEN custom_tags['team']        IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END AS has_team_tag,
  CASE WHEN MAX(CASE WHEN custom_tags['project']     IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END AS has_project_tag,
  CASE WHEN MAX(CASE WHEN custom_tags['environment'] IS NOT NULL THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END AS has_env_tag,
  CASE WHEN MAX(CASE WHEN custom_tags['team'] IS NOT NULL THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN custom_tags['project'] IS NOT NULL THEN 1 ELSE 0 END) = 1
        AND MAX(CASE WHEN custom_tags['environment'] IS NOT NULL THEN 1 ELSE 0 END) = 1
       THEN 'FULLY_TAGGED' ELSE 'INCOMPLETE' END                     AS tag_status
FROM system.billing.usage
WHERE usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND usage_metadata.cluster_id IS NOT NULL
GROUP BY usage_metadata.cluster_id
ORDER BY tag_status DESC, cluster_id
LIMIT 50
"""

def get_tag_coverage(workspace_id: str | None = None) -> pd.DataFrame:
    sql = TAG_COVERAGE_SQL
    if workspace_id:
        sql = sql.replace("WHERE usage_date", f"WHERE workspace_id = '{workspace_id}' AND usage_date")
    return run_query_chargeback(sql)

# ── 3. Chargeback KPIs ───────────────────────────────────────────────────────
def get_chargeback_kpis(team_df: pd.DataFrame, tag_df: pd.DataFrame) -> dict:
    """Compute KPIs from already-loaded dataframes (avoids extra DB round-trip)."""
    total = float(team_df["cost_usd"].sum()) if not team_df.empty else 0.0
    untagged_mask = team_df["team"].str.contains("UNTAGGED", na=False) if not team_df.empty else []
    untagged_cost = float(team_df.loc[untagged_mask, "cost_usd"].sum()) if not team_df.empty else 0.0
    untagged_pct  = round(100 * untagged_cost / max(total, 1), 1)

    if not tag_df.empty:
        fully_tagged = int((tag_df["tag_status"] == "FULLY_TAGGED").sum())
        tag_coverage = round(100 * fully_tagged / len(tag_df), 1)
    else:
        tag_coverage = 0.0

    return {
        "total_attributed_cost": round(float(total - untagged_cost), 2),
        "total_unattributed_cost": round(float(untagged_cost), 2),
        "untagged_pct": float(untagged_pct),
        "tag_coverage_pct": float(tag_coverage),
        "total_teams": int(team_df["team"].nunique()) if not team_df.empty else 0,
        "total_clusters": int(len(tag_df)) if not tag_df.empty else 0,
    }
