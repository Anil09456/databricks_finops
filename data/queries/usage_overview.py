"""
data/queries/usage_overview.py
════════════════════════════════════════════════════════════════════════════
SQL queries and mock data for the Usage Overview dashboard.

System tables used:
  • system.billing.usage  — primary spend source (DBUs × price)

Columns from system.billing.usage:
  usage_date, billing_origin_product, sku_name, usage_quantity,
  usage_metadata (struct), custom_tags (map), workspace_id
════════════════════════════════════════════════════════════════════════════
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from data.db import run_query_overall

rng = np.random.default_rng(42)

def _dates(n: int, offset: int = 0):
    base = datetime.today() - timedelta(days=offset)
    return [(base - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n)]

# ── 1. KPI Summary (single row) ───────────────────────────────────────────────
# All filters use CURRENT_DATE — the correct business logic:
#   MTD   = current calendar month only (even if $0 on day-1 due to billing lag)
#   7d    = rolling 7 days from today, regardless of month boundary
# Showing $0 on June 1 for MTD is correct — June billing simply hasn't arrived yet.
USAGE_KPI_SQL = """
SELECT
  ROUND(SUM(CASE WHEN u.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS mtd_cost,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_prev_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
                 THEN u.usage_quantity END), 2)                                       AS mtd_dbus,
  -- run rate = avg daily MTD * 30
  ROUND(SUM(CASE WHEN u.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END)
        / GREATEST(DATEDIFF(CURRENT_DATE, DATE_TRUNC('month', CURRENT_DATE)) + 1, 1)
        * 30, 2)                                                                      AS projected_monthly,
  -- naive 30-day forecast (last 7d avg x remaining days in month)
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END) / 7.0
        * (DAY(LAST_DAY(CURRENT_DATE)) - DAY(CURRENT_DATE))
        + SUM(CASE WHEN u.usage_date >= DATE_TRUNC('month', CURRENT_DATE)
                   THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2) AS forecasted_month_total
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
"""

def get_usage_kpi(workspace_id: str | None = None) -> pd.DataFrame:
    sql = USAGE_KPI_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_overall(sql)

# ── 2. Daily cost trend (90 days) ────────────────────────────────────────────
DAILY_TREND_SQL = """
SELECT
  u.usage_date,
  u.billing_origin_product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                                     AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 90 DAYS
GROUP BY 1, 2
ORDER BY 1, 2
"""

def get_daily_trend(workspace_id: str | None = None) -> pd.DataFrame:
    sql = DAILY_TREND_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_overall(sql)

# ── 3. Usage by product (bar / donut) ────────────────────────────────────────
SKU_BREAKDOWN_SQL = """
SELECT
  u.billing_origin_product,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)       AS cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                                           AS total_dbus,
  ROUND(100.0 * SUM(u.usage_quantity)
        / SUM(SUM(u.usage_quantity)) OVER (), 1)                             AS pct_of_total
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
GROUP BY 1, 2
ORDER BY cost_usd DESC
LIMIT 12
"""

def get_sku_breakdown(workspace_id: str | None = None) -> pd.DataFrame:
    sql = SKU_BREAKDOWN_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_overall(sql)

# ── 4. 14-day cost anomaly detection ─────────────────────────────────────────
COST_ANOMALY_SQL = """
WITH daily AS (
  SELECT u.usage_date,
         ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 21 DAYS
  GROUP BY 1
),
stats AS (
  SELECT usage_date, daily_cost,
         ROUND(AVG(daily_cost) OVER (ORDER BY usage_date
               ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 2) AS rolling_avg,
         ROUND(STDDEV(daily_cost) OVER (ORDER BY usage_date
               ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 2) AS rolling_std
  FROM daily
)
SELECT usage_date, daily_cost, rolling_avg,
       ROUND((daily_cost - rolling_avg) / NULLIF(rolling_std, 0), 2) AS z_score,
       CASE WHEN daily_cost > rolling_avg * 2.0 THEN 'critical'
            WHEN daily_cost > rolling_avg * 1.3 THEN 'high'
            ELSE 'normal' END                                          AS anomaly_level
FROM stats
ORDER BY usage_date DESC
LIMIT 14
"""

def get_cost_anomaly(workspace_id: str | None = None) -> pd.DataFrame:
    sql = COST_ANOMALY_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_overall(sql)

# ── 5. Workspace Cost Forecast (6mo historical + current month partial + 3mo AI forecast) ─
# Includes the current (partial) month so the chart always shows up to today.
# For multi-workspace accounts, each workspace_id gets its own forecast series.
WORKSPACE_COST_SQL = """
SELECT
  COALESCE(u.workspace_id, 'Account Level') AS workspace_id,
  DATE_TRUNC('month', u.usage_date) AS month,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL 6 MONTHS
GROUP BY 1, 2
ORDER BY 1, 2
"""

def get_workspace_cost(workspace_id: str | None = None) -> pd.DataFrame:
    # Non-demo: fetch 6 months + current month actuals, then project 3 months forward
    sql = WORKSPACE_COST_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    df = run_query_overall(sql)
    if df.empty:
        return df

    df["cost_type"] = "Actual"
    # Strip timezone info (Databricks returns datetime64[ns, Etc/UTC]) so all
    # subsequent comparisons use tz-naive Timestamps — prevents TypeError.
    raw_months = pd.to_datetime(df["month"])
    if raw_months.dt.tz is not None:
        raw_months = raw_months.dt.tz_convert("UTC").dt.tz_localize(None)
    df["month"] = raw_months.astype("datetime64[ns]")

    today = datetime.today()
    current_month_start = pd.Timestamp(today.year, today.month, 1)  # tz-naive

    forecast_rows = []

    for ws in df["workspace_id"].unique():
        ws_df = df[df["workspace_id"] == ws].sort_values("month")
        if ws_df.empty:
            continue

        # Use completed months only for trend (exclude partial current month)
        completed = ws_df[ws_df["month"] < current_month_start]
        if len(completed) < 2:
            # Fallback: use whatever we have
            completed = ws_df

        # Compute growth trend from last 3 completed months using linear regression
        recent = completed.tail(3)
        costs = recent["cost_usd"].values.astype(float)
        if len(costs) >= 2:
            # Simple linear trend
            x = list(range(len(costs)))
            x_mean = sum(x) / len(x)
            y_mean = sum(costs) / len(costs)
            slope = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, costs))
            denom = sum((xi - x_mean) ** 2 for xi in x)
            monthly_growth = slope / denom if denom != 0 else 0
        else:
            monthly_growth = 0

        # Last actual month as baseline for forecast
        last_actual_cost = float(completed.iloc[-1]["cost_usd"])
        last_month = completed.iloc[-1]["month"]

        # Project 3 months forward from the last COMPLETED month
        current_trend = last_actual_cost
        for i in range(1, 4):
            forecast_date = last_month + pd.DateOffset(months=i)
            current_trend = max(0.0, current_trend + monthly_growth)

            forecast_rows.append({
                "workspace_id": ws,
                "month": forecast_date,
                "cost_usd": round(current_trend, 2),
                "cost_type": "Forecast",
            })

    if forecast_rows:
        forecast_df = pd.DataFrame(forecast_rows)
        df = pd.concat([df, forecast_df], ignore_index=True)

    df = df.sort_values(["workspace_id", "month"])
    df["month_str"] = df["month"].dt.strftime("%b %Y")

    return df

# ── SKU WoW heatmap — weekly cost change by product (last 14 days) ────────────
SKU_WOW_SQL = """
WITH last_7 AS (
  SELECT u.billing_origin_product, ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_this_week
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY 1
),
prev_7 AS (
  SELECT u.billing_origin_product, ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS cost_prev_week
  FROM system.billing.usage u
  LEFT JOIN system.billing.list_prices lp
    ON u.sku_name = lp.sku_name
    AND u.usage_date >= lp.price_start_time
    AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
  WHERE u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
    AND u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
  GROUP BY 1
)
SELECT
  l.billing_origin_product,
  l.cost_this_week,
  COALESCE(p.cost_prev_week, 0) AS cost_prev_week,
  ROUND((l.cost_this_week - COALESCE(p.cost_prev_week, 0))
        / NULLIF(COALESCE(p.cost_prev_week, 0), 0) * 100, 1) AS wow_change_pct
FROM last_7 l
LEFT JOIN prev_7 p USING (billing_origin_product)
ORDER BY l.cost_this_week DESC
"""

def get_sku_wow(workspace_id: str | None = None) -> pd.DataFrame:
    sql = SKU_WOW_SQL
    if workspace_id:
        sql = sql.replace("WHERE u.usage_date", f"WHERE u.workspace_id = '{workspace_id}' AND u.usage_date")
    return run_query_overall(sql)


def get_workspaces() -> pd.DataFrame:
    """Fetch distinct workspace IDs and names from access logs or fallback to billing."""
    import logging
    logger = logging.getLogger(__name__)
    
    sql = """
    SELECT DISTINCT workspace_id, workspace_name
    FROM system.access.workspaces_latest
    WHERE status = 'RUNNING'
    """
    try:
        df = run_query_overall(sql)
        if df is not None and not df.empty:
            return df
    except Exception as e:
        logger.warning(f"Failed to query system.access.workspaces_latest: {e}")
    
    # Fallback to unique IDs in billing
    sql_fallback = """
    SELECT DISTINCT workspace_id, COALESCE(workspace_id, 'Account Level') AS workspace_name
    FROM system.billing.usage
    WHERE usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
      AND workspace_id IS NOT NULL
    """
    try:
        return run_query_overall(sql_fallback)
    except Exception as e:
        logger.error(f"Fallback to system.billing.usage failed: {e}")
        return pd.DataFrame(columns=["workspace_id", "workspace_name"])

