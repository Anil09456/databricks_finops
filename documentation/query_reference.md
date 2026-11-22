# FinOps CoPilot — Complete Query Reference

> Every SQL query executed by the application, mapped to its dashboard/metric card, backend file, frontend file, and API endpoint. Use this to run queries in Databricks and compare results & execution time.

---

## How to Read This Document

| Column | Meaning |
|--------|---------|
| **Dashboard / Card** | Where the result appears in the UI |
| **API Endpoint** | The FastAPI route serving the data |
| **Backend File** | Python file containing the SQL query |
| **Frontend File** | React component that calls the endpoint |
| **Threshold / Logic** | Business rules applied in the query or UI |

> **Dynamic Pricing Catalog**: Compute and storage cost calculations retrieve list prices dynamically by joining with the `system.billing.list_prices` table. This catalog is a Slowly Changing Dimension (SCD) Type 2 table joined on the SKU name and date range of the billing usage event. If a SKU price is not found in the list prices catalog, the cost defaults to `$0.0` (using `COALESCE(pricing.default, 0.0)`) for diagnostic purposes.

> **NULL / NaN Serialization**: When running these queries manually in Databricks, some aggregates (like total spilled bytes or wasted GB) will return `NULL` if no events occurred in the lookback window. In Python, these SQL `NULL` values are converted to Pandas `NaN`s. The FastAPI backend automatically sanitizes these using the `clean_df` helper in [api/cache.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/cache.py#L76-L86) to return standard JSON `null` values instead of throwing serialization errors.

---

## ─────────────────────────────────────────────────
## SECTION 1 — COMMAND CENTRE
### Page: `CommandCentre.jsx` → Tab Container

All Command Centre tabs mount simultaneously (CSS show/hide). All queries fire at **startup** (cache warm-up) in parallel via `ThreadPoolExecutor(max_workers=8)`.

---

### 📊 Tab 1: Overall

**Frontend file:** [`OverallTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/OverallTab.jsx)  
**Router file:** [`api/routers/overall.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/overall.py)  
**Query file:** [`data/queries/usage_overview.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_with_python_fast_api/data/queries/usage_overview.py)

---

#### Q1 — KPI Cards (MTD Cost, Last 7 Days, MTD DBUs, Projected Monthly, Month Forecast)

**Endpoint:** `GET /api/overall/kpi`  
**Cache key:** `overall:kpi`  
**Design Decision (2026-06-01):** All filters use `CURRENT_DATE` — the correct business logic. MTD = current calendar month only. Last 7 Days = rolling 7 days from today regardless of month boundary. If Databricks billing hasn't populated today's data yet (e.g. June 1st on first day of month), `$0` MTD is the correct honest answer — not a bug.

```sql
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
```

**UI Elements fed:**
- `MTD Cost` metric card
- `Last 7 Days` metric card (with WoW delta vs `cost_prev_7d`)
- `MTD DBUs` metric card
- `Projected Monthly` metric card
- `Month Forecast` metric card

**Threshold Logic:**
- WoW alert banner fires if `wow_change_pct > 30%`

---

#### Q2 — Daily Cost Trend Chart (90 days)

**Endpoint:** `GET /api/overall/trend`  
**Cache key:** `overall:trend`

```sql
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
```

**UI Element:** Chart — "Daily Cost by Product (90 days)" — Line chart, one series per `billing_origin_product`

---

#### Q3 — SKU Breakdown Donut Chart (30 days)

**Endpoint:** `GET /api/overall/sku-breakdown`  
**Cache key:** `overall:sku_breakdown`

```sql
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
```

**UI Element:** Chart — "Spend by Product (30 days)" — Donut/Pie chart

---

#### Q4 — Cost Anomaly Detection Chart (14 days)

**Endpoint:** `GET /api/overall/anomaly`  
**Cache key:** `overall:anomaly`

```sql
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
```

**UI Element:** Chart — "Cost Anomaly Detection (14 days)" — Scatter+Line chart  
**Threshold Logic:**
- `critical` = daily_cost > rolling_avg × 2.0 → red dot
- `high` = daily_cost > rolling_avg × 1.3 → amber dot
- `normal` → blue dot

---

#### Q5 — SKU Week-over-Week Change (WoW Bar Chart)

**Endpoint:** `GET /api/overall/sku-wow`  
**Cache key:** `overall:sku_wow`

```sql
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
```

**UI Element:** Chart — "SKU Week-over-Week Change" — Bar chart  
**Threshold Logic:** Bar color = red if `wow_change_pct > 0`, green if negative

---

#### Q6 — Workspace Cost Forecast

**Endpoint:** `GET /api/overall/workspace-cost`  
**Cache key:** `overall:workspace_cost`

```sql
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
```

> ⚠️ **Note:** After fetching, Python adds 3 months of linear-regression forecast data in memory (no extra SQL). The frontend uses this for the workspace cost trend + forecast chart on the Overall tab (via `Home.jsx`).

---

### 🖥️ Tab 2: Interactive

**Frontend file:** [`InteractiveTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/InteractiveTab.jsx)  
**Router file:** [`api/routers/interactive.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/interactive.py)  
**Query file:** [`data/queries/all_purpose.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/all_purpose.py)

---

#### Q7 — Classic Interactive KPI (ALL_PURPOSE)

**Endpoint:** `GET /api/interactive/classic/kpi`

```sql
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)  AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.cluster_id)                      AS cluster_count,
  COUNT(DISTINCT COALESCE(u.custom_tags['team'], 'untagged'))      AS team_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
```

**UI Elements:** KPI cards — Total Cost 30d, Cost 7d, Cluster Count, Team Count

---

#### Q8 — Classic Interactive Top Clusters (30 days)

**Endpoint:** `GET /api/interactive/classic/clusters`

```sql
SELECT
  u.usage_metadata.cluster_id                               AS cluster_id,
  COALESCE(u.custom_tags['cluster_name'], u.usage_metadata.cluster_id) AS cluster_name,
  COALESCE(u.custom_tags['team'],  'untagged')             AS team,
  COALESCE(u.custom_tags['user'],  'unknown')              AS owner,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS total_dbus,
  COUNT(DISTINCT u.usage_date)                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
  AND u.usage_metadata.cluster_id IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY cost_30d_usd DESC
LIMIT 15
```

**UI Element:** Table — Top 15 classic interactive clusters by cost

---

#### Q9 — Classic Interactive Daily Trend

**Endpoint:** `GET /api/interactive/classic/daily`

```sql
SELECT
  u.usage_date,
  COALESCE(u.custom_tags['team'], 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'ALL_PURPOSE'
GROUP BY 1, 2
ORDER BY 1, 2
```

**UI Element:** Chart — Daily cost trend by team (30 days)

---

#### Q10 — Serverless Interactive KPI (INTERACTIVE)

**Endpoint:** `GET /api/interactive/serverless/kpi`

```sql
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)  AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)  AS cost_prev_7d,
  COUNT(DISTINCT COALESCE(u.usage_metadata.cluster_id, u.usage_metadata.endpoint_id)) AS session_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'INTERACTIVE'
```

**UI Elements:** KPI cards — Serverless cost, session count

---

#### Q11 — Serverless Interactive Daily Trend

**Endpoint:** `GET /api/interactive/serverless/daily`

```sql
SELECT
  u.usage_date,
  COALESCE(u.custom_tags['team'], 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS daily_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS daily_dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.billing_origin_product = 'INTERACTIVE'
GROUP BY 1, 2
ORDER BY 1, 2
```

**UI Element:** Chart — Daily serverless compute cost by team

---

#### Q12 — Session GB Scanned Trend (14 days)

**Endpoint:** `GET /api/interactive/session-scan`  
**System table:** `system.query.history`

```sql
SELECT
  DATE(start_time)                                   AS query_date,
  COUNT(DISTINCT session_id)                         AS session_count,
  ROUND(SUM(read_bytes) / 1e9, 2)                   AS total_gb_scanned,
  ROUND(AVG(read_bytes) / 1e9, 3)                   AS avg_gb_per_query,
  ROUND(SUM(read_bytes) / NULLIF(COUNT(DISTINCT session_id), 0) / 1e9, 2)
                                                     AS avg_gb_per_session
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL 14 DAYS
  AND session_id IS NOT NULL
  AND execution_status = 'FINISHED'
GROUP BY 1
ORDER BY 1
```

**UI Element:** Chart — GB Scanned per Session trend

---

### ⚙️ Tab 3: Jobs

**Frontend file:** [`JobsTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/JobsTab.jsx)  
**Router file:** [`api/routers/jobs.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/jobs.py)  
**Query file:** [`data/queries/job_costs.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/job_costs.py)

> Jobs are identified using `u.usage_metadata.job_id IS NOT NULL`, with `u.sku_name NOT LIKE '%SERVERLESS%'` for Classic Jobs and `u.sku_name LIKE '%SERVERLESS%'` for Serverless Jobs.

---

#### Q-J1 — Classic Jobs KPI (total cost, last 7 days, prev 7 days, job count, active days)

**Endpoint:** `GET /api/jobs/classic/kpi`  
**Cache key:** `jobs:classic_kpi`

```sql
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.job_id)                                  AS job_count,
  COUNT(DISTINCT u.usage_date)                                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
```

#### Q-J2 — Classic Jobs Top (Top 10 jobs by cost in last 30 days)

**Endpoint:** `GET /api/jobs/classic/top`  
**Cache key:** `jobs:classic_top`  
**Change (2026-06-01):** Added `LEFT JOIN system.lakeflow.jobs` to resolve human-readable `job_name`. Frontend detail table now shows both `job_id` and `job_name`.

```sql
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)              AS total_runs
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY u.usage_metadata.job_id
ORDER BY cost_30d_usd DESC
LIMIT 10
```

#### Q-J3 — Classic Jobs Daily Trend (30 days daily cost)

**Endpoint:** `GET /api/jobs/classic/daily`  
**Cache key:** `jobs:classic_daily`

```sql
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name NOT LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
```

#### Q-J4 — Serverless Jobs KPI (total cost, last 7 days, prev 7 days, job count, active days)

**Endpoint:** `GET /api/jobs/serverless/kpi`  
**Cache key:** `jobs:serverless_kpi`

```sql
SELECT
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                        AS total_cost_30d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_7d,
  ROUND(SUM(CASE WHEN u.usage_date >= CURRENT_DATE - INTERVAL 14 DAYS
                  AND  u.usage_date <  CURRENT_DATE - INTERVAL 7 DAYS
                 THEN u.usage_quantity * COALESCE(lp.pricing.default, 0.0) END), 2)          AS cost_prev_7d,
  COUNT(DISTINCT u.usage_metadata.job_id)                                  AS job_count,
  COUNT(DISTINCT u.usage_date)                                             AS active_days
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
```

#### Q-J5 — Serverless Jobs Top (Top 10 serverless jobs by cost in last 30 days)

**Endpoint:** `GET /api/jobs/serverless/top`  
**Cache key:** `jobs:serverless_top`  
**Change (2026-06-01):** Added `LEFT JOIN system.lakeflow.jobs` to resolve human-readable `job_name`. Frontend detail table now shows both `job_id` and `job_name`.

```sql
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS cost_30d_usd,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)              AS total_runs
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY u.usage_metadata.job_id
ORDER BY cost_30d_usd DESC
LIMIT 10
```

#### Q-J6 — Serverless Jobs Daily Trend (30 days daily cost)

**Endpoint:** `GET /api/jobs/serverless/daily`  
**Cache key:** `jobs:serverless_daily`

```sql
SELECT
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) AS daily_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND u.sku_name LIKE '%SERVERLESS%'
GROUP BY 1
ORDER BY 1
```

#### Q-J7 — Failed Run Wasted Cost (Top 10 job names by wasted cost in last 30 days)

**Endpoint:** `GET /api/jobs/failed-cost`  
**Cache key:** `jobs:failed_cost`

```sql
SELECT
  COALESCE(u.custom_tags['project'], u.usage_metadata.job_id::STRING) AS job_name,
  COUNT(DISTINCT u.usage_metadata.job_run_id)                        AS total_runs,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)                 AS total_cost_usd,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2) / 
    NULLIF(COUNT(DISTINCT u.usage_metadata.job_run_id), 0)           AS avg_cost_per_run
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 30 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
GROUP BY 1
ORDER BY total_cost_usd DESC
LIMIT 10
```

#### Q-J8 — Weekly Job Cost Trend (8-week job cost trend for MERGE degradation detection)

**Endpoint:** `GET /api/jobs/weekly-trend`  
**Cache key:** `jobs:weekly_trend`

```sql
SELECT
  DATE_TRUNC('week', u.usage_date)                    AS week_start,
  COALESCE(u.custom_tags['project'], 'all_jobs')      AS job_group,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)  AS weekly_cost_usd
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL 56 DAYS
  AND u.usage_metadata.job_id IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 ASC
```

---

### 🏭 Tab 4: SQL Warehouses

**Frontend file:** [`SqlWarehouseTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/SqlWarehouseTab.jsx)  
**Router file:** [`api/routers/sql_warehouse.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/sql_warehouse.py)  
**Query file:** [`data/queries/sql_warehouse.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/sql_warehouse.py)

> Endpoints: `/api/sql-warehouse/health`, `/api/sql-warehouse/heatmap`, `/api/sql-warehouse/top-queries`, `/api/sql-warehouse/cache-trend`, `/api/sql-warehouse/classic/cost`, `/api/sql-warehouse/classic/daily`, `/api/sql-warehouse/serverless/cost`, `/api/sql-warehouse/serverless/daily`, `/api/sql-warehouse/idle-billing`, `/api/sql-warehouse/repeat-query-kpi`.

---

### 🔍 Tab 5: Query Intelligence

**Frontend file:** [`QueryIntelligenceTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/QueryIntelligenceTab.jsx)  
**Router file:** [`api/routers/query_intelligence.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/query_intelligence.py)  
**Query file:** [`data/queries/query_intelligence.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/query_intelligence.py)

> Endpoints: `/api/query-intelligence/kpi`, `/api/query-intelligence/spill-events`, `/api/query-intelligence/spill-kpi`, `/api/query-intelligence/repeat-queries`, `/api/query-intelligence/cache-breaker-users`, `/api/query-intelligence/shuffle-ratio`.

---

### 🔀 Tab 6: DLT

**Frontend file:** [`DltTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/DltTab.jsx)  
**Router file:** [`api/routers/dlt.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/dlt.py)  
**Query file:** [`data/queries/dlt_costs.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/dlt_costs.py)

> Endpoints: `/api/dlt/kpi`, `/api/dlt/classic/kpi`, `/api/dlt/classic/pipelines`, `/api/dlt/classic/daily`, `/api/dlt/serverless/kpi`, `/api/dlt/serverless/pipelines`, `/api/dlt/serverless/daily`, `/api/dlt/pipeline-health`, `/api/dlt/health-kpi`.

---

### 🗄️ Tab 7: Storage

**Frontend file:** [`StorageTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/StorageTab.jsx)  
**Router file:** [`api/routers/storage.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/storage.py)  
**Query file:** [`data/queries/storage_health.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/storage_health.py)

> Endpoints: `/api/storage/cost-trend`, `/api/storage/table-sizes`, `/api/storage/zombie-risk`, `/api/storage/kpi`, `/api/storage/vacuum-compliance`, `/api/storage/retain0-kpi`.

---

### 🏷️ Tab 8: Tagging & Chargeback

**Frontend file:** [`TaggingChargebackTab.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/tabs/TaggingChargebackTab.jsx)  
**Router file:** [`api/routers/chargeback.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/chargeback.py)  
**Query file:** [`data/queries/chargeback.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/chargeback.py)

> Endpoints: `/api/chargeback/team-spend`, `/api/chargeback/tag-coverage`, `/api/chargeback/kpis`.

---

## ─────────────────────────────────────────────────
## SECTION 2 — COST LOOKUP

**Page:** [`CostLookup.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/CostLookup.jsx)  
**Router:** [`api/routers/lookup.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/lookup.py)  
**Query file:** [`data/queries/cost_lookup.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/queries/cost_lookup.py)

> ⚠️ **Important:** Cost Lookup queries are **NOT pre-cached**. They run live on every Search button click. `days` is user-selected (7 / 14 / 30 / 60 / 90 / 180 / 365). Replace `<search>` with actual search term and `<days>` with number.

---

### 🔧 Subsection A — Job Lookup

**Endpoint:** `GET /api/lookup/job?search=<term>&days=<N>`  
**Fires 2 queries simultaneously:**

#### Q-L1 — Job Daily Detail (max 200 rows)

```sql
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  u.usage_date,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus,
  COUNT(DISTINCT u.usage_metadata.job_run_id)               AS run_count
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND (LOWER(u.usage_metadata.job_id) LIKE LOWER('%<search>%')
    OR LOWER(j.name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.job_id, u.usage_date, u.sku_name
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

**UI Element:** "Daily Breakdown" table + Daily Cost bar chart + Daily DBUs bar chart

#### Q-L2 — Job Summary (per job aggregate)

```sql
SELECT
  u.usage_metadata.job_id                                  AS job_id,
  COALESCE(MAX(j.name), u.usage_metadata.job_id)           AS job_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')         AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  COUNT(DISTINCT u.usage_metadata.job_run_id)               AS total_runs,
  ROUND(AVG(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS avg_cost_per_run,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.jobs j
  ON u.usage_metadata.job_id = j.job_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.job_id IS NOT NULL
  AND (LOWER(u.usage_metadata.job_id) LIKE LOWER('%<search>%')
    OR LOWER(j.name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.job_id
ORDER BY total_cost_usd DESC
```

**UI Elements (Metric Cards):**
| Card | Source Column | Threshold |
|------|--------------|-----------|
| TOTAL COST | `total_cost_usd` | Red if > $500 |
| TOTAL DBUs | `total_dbus` | — |
| TOTAL RUNS | `total_runs` | — |
| AVG COST/RUN | `avg_cost_per_run` | — |
| TEAM | `team` | Amber if = 'untagged' |

---

### 🔀 Subsection B — DLT Pipeline Lookup

**Endpoint:** `GET /api/lookup/pipeline?search=<term>&days=<N>`  
**Fires 2 queries simultaneously:**

#### Q-L3 — Pipeline Daily Detail (max 200 rows)

```sql
SELECT
  u.usage_metadata.dlt_pipeline_id                              AS pipeline_id,
  COALESCE(MAX(p.name), u.usage_metadata.dlt_pipeline_id)  AS pipeline_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')              AS team,
  u.usage_date,
  u.sku_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)        AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                          AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.pipelines p
  ON u.usage_metadata.dlt_pipeline_id = p.pipeline_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.dlt_pipeline_id IS NOT NULL
  AND (LOWER(u.usage_metadata.dlt_pipeline_id) LIKE LOWER('%<search>%')
    OR LOWER(p.name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.dlt_pipeline_id, u.usage_date, u.sku_name
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

**UI Element:** "Daily Breakdown" table + Daily Cost bar chart + Daily DBUs bar chart

#### Q-L4 — Pipeline Summary

```sql
SELECT
  u.usage_metadata.dlt_pipeline_id                              AS pipeline_id,
  COALESCE(MAX(p.name), u.usage_metadata.dlt_pipeline_id)  AS pipeline_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')              AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)        AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                          AS total_dbus,
  COUNT(DISTINCT u.usage_date)                             AS active_days,
  MIN(u.usage_date)                                        AS first_seen,
  MAX(u.usage_date)                                        AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.lakeflow.pipelines p
  ON u.usage_metadata.dlt_pipeline_id = p.pipeline_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.dlt_pipeline_id IS NOT NULL
  AND (LOWER(u.usage_metadata.dlt_pipeline_id) LIKE LOWER('%<search>%')
    OR LOWER(p.name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.dlt_pipeline_id
ORDER BY total_cost_usd DESC
```

**UI Elements (Metric Cards):** TOTAL COST, TOTAL DBUs, ACTIVE DAYS, TEAM

---

### 🖥️ Subsection C — Cluster Lookup

**Endpoint:** `GET /api/lookup/cluster?search=<term>&days=<N>`  
**Fires 2 queries simultaneously:**

#### Q-L5 — Cluster Daily Detail (max 200 rows)

```sql
SELECT
  u.usage_metadata.cluster_id                              AS cluster_id,
  COALESCE(MAX(c.cluster_name), u.usage_metadata.cluster_id) AS cluster_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')             AS team,
  u.billing_origin_product,
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)       AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                         AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.clusters c
  ON u.usage_metadata.cluster_id = c.cluster_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.cluster_id IS NOT NULL
  AND (LOWER(u.usage_metadata.cluster_id) LIKE LOWER('%<search>%')
    OR LOWER(c.cluster_name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.cluster_id, u.billing_origin_product, u.usage_date
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

#### Q-L6 — Cluster Summary

```sql
SELECT
  u.usage_metadata.cluster_id                             AS cluster_id,
  COALESCE(MAX(c.cluster_name), u.usage_metadata.cluster_id) AS cluster_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')            AS team,
  u.billing_origin_product                               AS product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)      AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                        AS total_dbus,
  COUNT(DISTINCT u.usage_date)                           AS active_days,
  MIN(u.usage_date)                                      AS first_seen,
  MAX(u.usage_date)                                      AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.clusters c
  ON u.usage_metadata.cluster_id = c.cluster_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.cluster_id IS NOT NULL
  AND (LOWER(u.usage_metadata.cluster_id) LIKE LOWER('%<search>%')
    OR LOWER(c.cluster_name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.cluster_id, u.billing_origin_product
ORDER BY total_cost_usd DESC
```

**UI Elements (Metric Cards):** TOTAL COST (red if > $1000), TOTAL DBUs, PRODUCT, ACTIVE DAYS, TEAM

---

### 🏭 Subsection D — Warehouse Lookup

**Endpoint:** `GET /api/lookup/warehouse?search=<warehouse_id>&days=<N>`  
**Fires 3 queries simultaneously:**

#### Q-L7 — Warehouse Billing Cost Detail (max 200 rows)

```sql
SELECT
  u.usage_date,
  u.usage_metadata.warehouse_id                             AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), u.usage_metadata.warehouse_id) AS warehouse_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.warehouses w
  ON u.usage_metadata.warehouse_id = w.warehouse_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.warehouse_id IS NOT NULL
  AND (LOWER(u.usage_metadata.warehouse_id) LIKE LOWER('%<search>%')
    OR LOWER(w.warehouse_name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.warehouse_id, u.usage_date
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

#### Q-L8 — Warehouse Billing Summary

```sql
SELECT
  u.usage_metadata.warehouse_id                             AS warehouse_id,
  COALESCE(MAX(w.warehouse_name), u.usage_metadata.warehouse_id) AS warehouse_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')               AS team,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
LEFT JOIN system.compute.warehouses w
  ON u.usage_metadata.warehouse_id = w.warehouse_id
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.usage_metadata.warehouse_id IS NOT NULL
  AND (LOWER(u.usage_metadata.warehouse_id) LIKE LOWER('%<search>%')
    OR LOWER(w.warehouse_name) LIKE LOWER('%<search>%'))
GROUP BY u.usage_metadata.warehouse_id
ORDER BY total_cost_usd DESC
```

#### Q-L9 — Warehouse Query Stats (from `system.query.history`, max 200 rows)

```sql
SELECT
  compute.warehouse_id                                  AS warehouse_id,
  DATE(start_time)                                      AS query_date,
  COUNT(*)                                              AS query_count,
  ROUND(SUM(read_bytes) / 1073741824.0, 2)             AS total_gb_scanned,
  ROUND(AVG(total_task_duration_ms) / 1000.0, 1)       AS avg_duration_s,
  ROUND(MAX(total_task_duration_ms) / 1000.0, 1)       AS max_duration_s,
  COUNT(*) FILTER (WHERE execution_status = 'FAILED')  AS failed_queries,
  COUNT(*) FILTER (WHERE from_result_cache = true)     AS cached_queries
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL <days> DAYS
  AND LOWER(compute.warehouse_id) LIKE LOWER('%<search>%')
  AND execution_status IN ('FINISHED','FAILED')
GROUP BY 1, 2
ORDER BY query_date DESC, total_gb_scanned DESC
LIMIT 200
```

**UI Elements (Metric Cards):**
| Card | Source | Threshold |
|------|--------|-----------|
| TOTAL COST | Sum of `cost_usd` | Red if > $500 |
| TOTAL DBUs | Sum of `dbus` | — |
| TOTAL QUERIES | Sum of `query_count` | — |
| TOTAL GB SCANNED | Sum of `total_gb_scanned` | — |
| CACHE HIT % | `cached_queries / query_count * 100` | Red if < 60%, Green if ≥ 60% |

**Table shown:** "Daily Query Statistics" with query_count, GB scanned, avg/max duration, failed count, cached count

---

### 👤 Subsection E — User Lookup

**Endpoint:** `GET /api/lookup/user?search=<email>&days=<N>`  
**Fires 3 queries simultaneously:**

#### Q-L10 — User Billing Cost Detail (max 200 rows)

```sql
SELECT
  LOWER(u.identity_metadata.run_as)                         AS user_name,
  u.usage_date,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)         AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                           AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.identity_metadata.run_as IS NOT NULL
  AND LOWER(u.identity_metadata.run_as) LIKE LOWER('%<search>%')
GROUP BY 1, 2
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

#### Q-L11 — User Billing Summary

```sql
SELECT
  LOWER(u.identity_metadata.run_as)                         AS user_name,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 2)         AS total_cost_usd,
  ROUND(SUM(u.usage_quantity), 2)                           AS total_dbus,
  COUNT(DISTINCT u.usage_date)                              AS active_days,
  MIN(u.usage_date)                                         AS first_seen,
  MAX(u.usage_date)                                         AS last_seen
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.identity_metadata.run_as IS NOT NULL
  AND LOWER(u.identity_metadata.run_as) LIKE LOWER('%<search>%')
GROUP BY 1
ORDER BY total_cost_usd DESC
```

#### Q-L12 — User Query Stats (from `system.query.history`, max 200 rows)

```sql
SELECT
  LOWER(executed_by)                                    AS user_name,
  DATE(start_time)                                      AS query_date,
  COUNT(*)                                              AS query_count,
  ROUND(SUM(read_bytes) / 1073741824.0, 2)             AS total_gb_scanned,
  ROUND(AVG(total_task_duration_ms) / 1000.0, 1)       AS avg_duration_s,
  COUNT(*) FILTER (WHERE from_result_cache = true)     AS cached_hits,
  ROUND(100.0 * COUNT(*) FILTER (WHERE from_result_cache = true) / COUNT(*), 1) AS cache_pct
FROM system.query.history
WHERE start_time >= CURRENT_DATE - INTERVAL <days> DAYS
  AND LOWER(executed_by) LIKE LOWER('%<search>%')
  AND execution_status = 'FINISHED'
GROUP BY 1, 2
ORDER BY query_date DESC, total_gb_scanned DESC
LIMIT 200
```

**UI Elements (Metric Cards):**
| Card | Source | Threshold |
|------|--------|-----------|
| TOTAL COST | Sum of billing `cost_usd` | — |
| TOTAL DBUs | Sum of billing `dbus` | — |
| TOTAL QUERIES | Sum of query_history `query_count` | — |
| TOTAL GB SCANNED | Sum of `total_gb_scanned` | — |
| AVG CACHE HIT % | Average of `cache_pct` | Green if ≥ 60%, Red if < 60% |

**Charts:** Daily Cost bar chart + Daily Cache Hit % line chart (with 60% target line)

---

### 📓 Subsection F — Notebook Lookup

**Endpoint:** `GET /api/lookup/notebook?search=<term>&days=<N>`  
**Fires 1 query:**

#### Q-L13 — Notebook Detail (max 200 rows)

```sql
SELECT
  COALESCE(u.usage_metadata.notebook_id, 'unknown')       AS notebook_id,
  COALESCE(u.usage_metadata.notebook_id, 'unknown')       AS notebook_name,
  COALESCE(MAX(u.custom_tags['team']), 'untagged')        AS team,
  u.usage_date,
  u.billing_origin_product,
  ROUND(SUM(u.usage_quantity * COALESCE(lp.pricing.default, 0.0)), 4)       AS cost_usd,
  ROUND(SUM(u.usage_quantity), 4)                         AS dbus
FROM system.billing.usage u
LEFT JOIN system.billing.list_prices lp
  ON u.sku_name = lp.sku_name
  AND u.usage_date >= lp.price_start_time
  AND (lp.price_end_time IS NULL OR u.usage_date <= lp.price_end_time)
WHERE u.usage_date >= CURRENT_DATE - INTERVAL <days> DAYS
  AND u.billing_origin_product IN ('INTERACTIVE', 'INTERACTIVE_SERVERLESS')
  AND u.usage_metadata.notebook_id IS NOT NULL
  AND LOWER(u.usage_metadata.notebook_id) LIKE LOWER('%<search>%')
GROUP BY u.usage_metadata.notebook_id, u.usage_date, u.billing_origin_product
ORDER BY u.usage_date DESC, cost_usd DESC
LIMIT 200
```

**UI Elements (Metric Cards):** TOTAL COST, TOTAL DBUs, ACTIVE DAYS  
**Charts:** Daily Cost bar + Daily DBUs bar  
**Table:** "Daily Cost breakdown" with date, product, cost, DBUs

---

## ─────────────────────────────────────────────────
## SECTION 3 — RUN INTELLIGENCE

**Page:** [`RunIntelligence.jsx`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/frontend/src/pages/RunIntelligence.jsx)  
**Router:** [`api/routers/run_intelligence.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/routers/run_intelligence.py)  
**Core logic:** [`log_processor/run_intelligence/system_table_fetcher.py`](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/log_processor/run_intelligence/system_table_fetcher.py)

> ⚠️ Run Intelligence uses a **different connector** — it calls the Databricks REST API (`/api/2.0/sql/statements`) directly with `requests`, NOT the `databricks-sql-connector`. All queries are **live on demand**, not cached.

---

### Step 1 — Load Jobs List

**Endpoint:** `GET /api/run-intelligence/jobs?lookback_days=30&max_jobs=50`  
**UI Element:** Jobs dropdown — "Load Jobs" button

#### Q-RI1 — List Recent Jobs

```sql
SELECT job_id,
       COALESCE(
         MAX(CASE WHEN run_name IS NOT NULL AND run_name != '' THEN run_name END),
         CONCAT('Job ', job_id)
       ) AS display_name,
       MAX(period_start_time) AS last_run_at,
       COUNT(*) AS total_runs
FROM   system.lakeflow.job_run_timeline
WHERE  period_start_time >= CURRENT_TIMESTAMP - INTERVAL 30 DAYS
GROUP BY job_id
ORDER BY last_run_at DESC
LIMIT 50
```

---

### Step 2 — Load Runs for a Job

**Endpoint:** `GET /api/run-intelligence/jobs/{job_id}/runs?max_runs=20`  
**UI Element:** Runs dropdown

#### Q-RI2 — List Runs for Job

```sql
SELECT run_id, run_name, result_state,
       period_start_time, period_end_time,
       TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
FROM   system.lakeflow.job_run_timeline
WHERE  job_id = '<job_id>'
ORDER BY period_start_time DESC
LIMIT  20
```

---

### Step 3 — Load Pipelines List

**Endpoint:** `GET /api/run-intelligence/pipelines?lookback_days=30&max_pipelines=30`  
**UI Element:** Pipelines dropdown — "Load Pipelines" button

#### Q-RI3 — List Recent Pipelines

```sql
SELECT pipeline_id,
       MAX(update_id)    AS last_update_id,
       COUNT(*)          AS total_updates
FROM   system.lakeflow.pipeline_update_timeline
GROUP BY pipeline_id
ORDER BY last_update_id DESC
LIMIT  30
```

---

### Step 4 — Load Pipeline Updates

**Endpoint:** `GET /api/run-intelligence/pipelines/{pipeline_id}/updates?max_updates=20`

#### Q-RI4 — List Pipeline Updates

```sql
SELECT update_id, update_type, result_state, request_id
FROM   system.lakeflow.pipeline_update_timeline
WHERE  pipeline_id = '<pipeline_id>'
ORDER BY update_id DESC
LIMIT  20
```

---

### Step 5 — Analyze Run (Job)

**Endpoint:** `POST /api/run-intelligence/analyze`  
**Fires 4–5 queries in sequence:**

#### Q-RI5 — Job Run Summary

```sql
SELECT job_id, run_id, run_name, run_type, result_state,
       period_start_time, period_end_time,
       TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds,
       compute
FROM   system.lakeflow.job_run_timeline
WHERE  job_id = '<job_id>' AND run_id = '<run_id>'
LIMIT 1
```

**UI Element:** ⏱️ Duration metric card

---

#### Q-RI6 — Cluster Config Enrichment

```sql
SELECT DISTINCT
    tc.compute_info.cluster_id   AS cluster_id,
    c.dbr_version,
    c.driver_node_type           AS driver_node_type_id
FROM (
    SELECT EXPLODE(compute) AS compute_info
    FROM   system.lakeflow.job_task_run_timeline
    WHERE  job_id = '<job_id>' AND job_run_id = '<run_id>'
      AND  compute IS NOT NULL
) tc
LEFT JOIN system.compute.clusters c
  ON tc.compute_info.cluster_id = c.cluster_id
LIMIT 1
```

**UI Elements:** Infrastructure cards — Compute Type, Driver Node, DBR Version, Photon

---

#### Q-RI7 — Task Breakdown

```sql
SELECT task_key, result_state,
       period_start_time, period_end_time,
       TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
FROM   system.lakeflow.job_task_run_timeline
WHERE  job_id = '<job_id>' AND job_run_id = '<run_id>'
ORDER BY period_start_time
```

**UI Element:** Signals detection (task failures → CRITICAL signals)

---

#### Q-RI8 — Cost Breakdown

```sql
SELECT
    u.sku_name,
    COALESCE(u.usage_metadata.node_type, '') AS node_type,
    ROUND(SUM(u.usage_quantity), 4)                                    AS total_dbus,
    ROUND(MAX(p.pricing.effective_list.default), 4)                    AS price_per_dbu_usd,
    ROUND(SUM(u.usage_quantity * p.pricing.effective_list.default), 4) AS cost_usd
FROM   system.billing.usage u
LEFT JOIN system.billing.list_prices p
  ON   u.sku_name = p.sku_name
  AND  u.cloud    = p.cloud
  AND  u.usage_start_time >= p.price_start_time
  AND  (p.price_end_time IS NULL OR u.usage_start_time < p.price_end_time)
WHERE  u.usage_metadata.job_id     = '<job_id>'
  AND  u.usage_metadata.job_run_id = '<run_id>'
  AND  u.usage_date >= '<run_date - 2 days>'
  AND  u.usage_date <= '<run_date + 2 days>'
GROUP BY u.sku_name, u.usage_metadata.node_type
```

**UI Element:** 💰 Total Cost metric card

---

#### Q-RI9 — Baseline Run (for comparison)

Depends on `baseline_type` setting:

**Last Successful Run (default):**
```sql
SELECT run_id, period_start_time, period_end_time, result_state,
       TIMESTAMPDIFF(SECOND, period_start_time, period_end_time) AS duration_seconds
FROM   system.lakeflow.job_run_timeline
WHERE  job_id       = '<job_id>'
  AND  run_id      != '<run_id>'
  AND  result_state = 'SUCCEEDED'
ORDER BY period_start_time DESC
LIMIT 1
```

**Previous Run:**
```sql
... WHERE job_id = '<job_id>' AND run_id != '<run_id>'
ORDER BY period_start_time DESC LIMIT 1
```

**Specific Run ID:**
```sql
... WHERE job_id = '<job_id>' AND run_id = '<baseline_run_id>' LIMIT 1
```

**UI Element:** 📈 vs Baseline metric card (shows `+X% slower` or `X% faster`)

---

### Step 5 (Pipeline) — Analyze DLT Update

**Endpoint:** `POST /api/run-intelligence/analyze` (with `entity_type: "pipeline"`)  
**Fires 5–6 queries:**

#### Q-RI10 — Pipeline Update Summary

```sql
SELECT pipeline_id, update_id, update_type, result_state, request_id
FROM   system.lakeflow.pipeline_update_timeline
WHERE  pipeline_id = '<pipeline_id>' AND update_id = '<update_id>'
LIMIT 1
```

#### Q-RI11 — Dataset Metrics

```sql
SELECT dataset_name, dataset_type, num_output_rows, backlog_bytes, backlog_files
FROM   system.lakeflow.pipeline_dataset_timeline
WHERE  pipeline_id = '<pipeline_id>' AND update_id = '<update_id>'
ORDER BY num_output_rows DESC NULLS LAST
```

**UI Element:** 📦 Rows Processed metric card

#### Q-RI12 — Flow Metrics

```sql
SELECT flow_name, status, num_output_rows
FROM   system.lakeflow.pipeline_flow_timeline
WHERE  pipeline_id = '<pipeline_id>' AND update_id = '<update_id>'
ORDER BY flow_name
```

#### Q-RI13 — Data Quality Expectations

```sql
SELECT expectation_name, passed_records, failed_records,
       CASE
         WHEN (passed_records + failed_records) > 0
         THEN ROUND(failed_records * 100.0 / (passed_records + failed_records), 2)
         ELSE 0
       END AS failure_pct
FROM   system.lakeflow.pipeline_expectations_timeline
WHERE  pipeline_id = '<pipeline_id>' AND update_id = '<update_id>'
ORDER BY failed_records DESC NULLS LAST
```

**UI Element:** 🛡️ Data Quality Expectations table (shown only if expectations exist)

#### Q-RI14 — Pipeline Cost Breakdown

```sql
SELECT u.sku_name,
       COALESCE(u.usage_metadata.node_type, '') AS node_type,
       ROUND(SUM(u.usage_quantity), 4)                                    AS total_dbus,
       ROUND(MAX(p.pricing.effective_list.default), 4)                    AS price_per_dbu_usd,
       ROUND(SUM(u.usage_quantity * p.pricing.effective_list.default), 4) AS cost_usd
FROM   system.billing.usage u
LEFT JOIN system.billing.list_prices p
  ON   u.sku_name = p.sku_name AND u.cloud = p.cloud
  AND  u.usage_start_time >= p.price_start_time
  AND  (p.price_end_time IS NULL OR u.usage_start_time < p.price_end_time)
WHERE  u.custom_tags['PipelineId'] = '<pipeline_id>'
  AND  u.usage_date >= CURRENT_DATE - INTERVAL 90 DAYS
GROUP BY u.sku_name, u.usage_metadata.node_type
```

**UI Element:** 💰 Total Cost metric card

---

### Step 6 — AI Recommendations

**Endpoint:** `POST /api/run-intelligence/ai-recommendations`  
**No SQL.** Sends pre-built `summary` JSON to Google Gemini (`google-genai` SDK). Returns structured recommendations.

**UI Elements:**
- 🤖 AI Recommendations panel (findings + code snippets)
- Severity badges: CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## ─────────────────────────────────────────────────
## SECTION 4 — PROBLEM DIAGNOSIS: Why Non-Overall Sections Show Skeleton

> [!IMPORTANT]
> The Overall tab works because it was the first fully implemented and tested tab. The other tabs likely show skeleton (loading state that never resolves) due to one of the following root causes:

### Root Cause Checklist

| # | Symptom | Likely Cause |
|---|---------|-------------|
| 1 | Endpoint returns `[]` empty array | Query returns no data (check if billing_origin_product values like `'JOBS'`, `'ALL_PURPOSE'` exist in your workspace) |
| 2 | Endpoint returns `500` error | Missing system table permissions (e.g., `system.lakeflow.*` not enabled) |
| 3 | Endpoint returns data but UI shows skeleton | Frontend hardcodes `loading = true` and never sets it `false` on empty response |
| 4 | `/api/health` shows `cache: {}` for all keys | Cache warm-up failed due to network drop at startup |

### How to Diagnose

1. Open `http://localhost:8601/docs`
2. Test each endpoint listed above directly
3. If endpoint returns `[]` → data is missing in your workspace for that product type
4. If endpoint returns `500` → check backend terminal logs for the exact SQL error
5. If endpoint returns data but UI doesn't show it → frontend rendering bug

### System Tables Required

| Section | System Tables Needed |
|---------|---------------------|
| Overall | `system.billing.usage` |
| Interactive | `system.billing.usage`, `system.query.history` |
| Jobs | `system.billing.usage` |
| SQL Warehouse | `system.billing.usage`, `system.query.history` |
| Query Intelligence | `system.query.history` |
| DLT | `system.billing.usage` |
| Storage | `system.billing.usage`, `system.information_schema` |
| Chargeback | `system.billing.usage` |
| Run Intelligence | `system.lakeflow.*`, `system.billing.usage`, `system.billing.list_prices`, `system.compute.clusters` |

---

## ─────────────────────────────────────────────────
## SECTION 5 — SYSTEM TABLE REFERENCE

| System Table | Data Available Since | Retention |
|-------------|---------------------|-----------|
| `system.billing.usage` | GA | 1 year |
| `system.billing.list_prices` | GA | Full history |
| `system.query.history` | GA | 90 days |
| `system.compute.clusters` | GA | 365 days |
| `system.lakeflow.job_run_timeline` | Preview/GA | 60 days |
| `system.lakeflow.job_task_run_timeline` | Preview/GA | 60 days |
| `system.lakeflow.pipeline_update_timeline` | Preview/GA | 60 days |
| `system.lakeflow.pipeline_dataset_timeline` | Preview/GA | 60 days |
| `system.lakeflow.pipeline_flow_timeline` | Preview/GA | 60 days |
| `system.lakeflow.pipeline_expectations_timeline` | Preview | 60 days |

> ⚠️ `system.lakeflow.*` tables require **System Tables** to be enabled for your workspace in Databricks Account Console.
