# FinOps CoPilot — Command Centre Metrics & Charts Reference

This document provides a comprehensive explanation of every metric card, chart, and table across all **9 sections** of the FinOps CoPilot Command Centre. It outlines what each component does or provides, and how it is useful to the users for cost optimization, trend analysis, and performance tuning.

---

## SECTION 1 — OVERALL

This section provides a high-level executive dashboard summarizing month-to-date spending, short-term trends, raw compute metrics, and future cost forecasts across the entire catalog.

### 1. Metric Cards
* **MTD Cost**
  * **What it does / provides**: Displays the total billing cost incurred month-to-date (MTD) in USD across all SKUs.
  * **How it will be useful**: Gives immediate visibility into current monthly run-rate, allowing users to track overall budget consumption.
* **Last 7 Days**
  * **What it does / provides**: Displays the total spend over the last 7 calendar days compared to the preceding 7 days, along with the percentage Week-over-Week (WoW) cost change.
  * **How it will be useful**: Helps detect recent cost spikes or sudden cost reductions.
* **MTD DBUs**
  * **What it does / provides**: Displays the raw number of Databricks Units (DBUs) consumed month-to-date.
  * **How it will be useful**: Isolates pure compute volume trends independently of pricing fluctuations, discounts, or SKU-specific rates.
* **Projected Monthly**
  * **What it does / provides**: Projects the end-of-month total cost in USD based on a linear extrapolation of the current MTD daily spend run-rate.
  * **How it will be useful**: Acts as an early warning signal for monthly budget overruns.
* **Month Forecast**
  * **What it does / provides**: Calculates an AI-driven forecast of total spend for the active calendar month.
  * **How it will be useful**: Provides a more accurate end-of-month spend prediction than simple run-rate projection by factoring in recent week-level changes.

### 2. Charts & Tables
* **Daily Cost by Product (90 days)**
  * **What it does / provides**: A stacked line/scatter Plotly chart tracking daily spend broken down by Databricks product workloads (`ALL_PURPOSE`, `JOBS`, `SQL`, `DLT`, etc.) over the last 90 days.
  * **How it will be useful**: Helps identify which specific compute category is driving overall account spend.
* **Spend by Product (30 days)**
  * **What it does / provides**: A donut Plotly chart showing the percentage breakdown of month-to-date spend by Databricks product type.
  * **How it will be useful**: Visualizes the distribution of costs, indicating where optimization efforts will yield the highest return.
* **Cost Anomaly Detection (14 days)**
  * **What it does / provides**: A scatter/line Plotly chart showing daily costs against a rolling 7-day average to identify and flag anomalies exceeding standard variance thresholds.
  * **How it will be useful**: Automatically alerts team leads to unexpected cost spikes requiring immediate remediation.
* **SKU Week-over-Week Change**
  * **What it does / provides**: A bar Plotly chart showing week-over-week cost change percentages by Databricks SKU/product line.
  * **How it will be useful**: Highlights which specific SKU models are growing (colored red) or shrinking (colored green).

---

## SECTION 2 — INTERACTIVE

This section monitors ad-hoc developer notebook compute workloads, split between traditional user-managed (Classic) clusters and instant auto-scaling (Serverless) compute.

### 1. Metric Cards (Classic All-Purpose Clusters)
* **TOTAL COST**
  * **What it does / provides**: Displays the total spend on classic interactive (all-purpose) clusters over the last 30 days.
  * **How it will be useful**: Measures overall ad-hoc developer compute spend.
* **WoW CHANGE**
  * **What it does / provides**: Shows the week-over-week cost change percentage for classic compute vs the previous 7 days.
  * **How it will be useful**: Alerts administrators when developer compute usage starts to spike.
* **CLUSTERS**
  * **What it does / provides**: Counts the distinct classic interactive clusters active in the last 30 days.
  * **How it will be useful**: Helps track cluster sprawl and detect redundant clusters.
* **TEAMS**
  * **What it does / provides**: Counts the distinct team tags associated with classic interactive compute spend.
  * **How it will be useful**: Indicates how widely interactive clusters are distributed across organizational units.
* **UNTAGGED**
  * **What it does / provides**: Counts the classic interactive clusters that are missing mandatory team tags.
  * **How it will be useful**: Highlights "shadow spend" that cannot be billed back to specific departments.

### 2. Metric Cards (Serverless Interactive Compute)
* **SERVERLESS COST**
  * **What it does / provides**: Sums the billing cost of serverless interactive notebook compute sessions over the last 30 days.
  * **How it will be useful**: Tracks the spend and adoption of serverless compute, which shuts down immediately when users are idle.
* **WoW CHANGE** (Serverless)
  * **What it does / provides**: Shows the week-over-week cost change percentage for serverless interactive compute vs the previous 7 days.
  * **How it will be useful**: Monitors serverless session cost trends.
* **SESSIONS**
  * **What it does / provides**: Counts distinct serverless interactive notebook sessions active in the last 30 days.
  * **How it will be useful**: Reflects developer activity and engagement with serverless notebooks.

### 3. Charts & Tables
* **DAILY CLASSIC COST (USD)**
  * **What it does / provides**: A bar Plotly chart displaying daily spend for classic interactive compute.
  * **How it will be useful**: Visualizes classic compute load trends over time, helping to observe weekly usage cycles.
* **COST BY TEAM (30d)**
  * **What it does / provides**: A bar Plotly chart representing classic interactive compute costs aggregated by team tag.
  * **How it will be useful**: Identifies which teams are the largest consumers of classic interactive resources.
* **TOP CLASSIC CLUSTERS BY COST** (Table)
  * **What it does / provides**: Lists clusters sorted by cost, showing name, team tag, owner email, 30-day cost, DBUs, and active days.
  * **How it will be useful**: Pinpoints specific high-cost clusters that might need autotermination limits tuned or sizing adjusted.
* **DAILY SERVERLESS COST (USD)**
  * **What it does / provides**: A bar Plotly chart displaying daily spend for serverless interactive sessions.
  * **How it will be useful**: Displays serverless interactive session costs over time.
* **📈 GB SCANNED PER INTERACTIVE SESSION (14 DAYS)**
  * **What it does / provides**: A line Plotly chart tracking the average volume of data scanned (in GB) per serverless session over 14 days.
  * **How it will be useful**: Identifies unoptimized user queries or full-table scans that waste session DBUs.

---

## SECTION 3 — JOBS

This section monitors scheduled production workflow pipelines, split between classic job clusters and serverless jobs.

### 1. Metric Cards (Classic Jobs)
* **30-Day Cost**
  * **What it does / provides**: Sums the total billing spend on workflows running on classic job clusters in the last 30 days.
  * **How it will be useful**: Establishes the baseline cost of running scheduled jobs.
* **Last 7 Days**
  * **What it does / provides**: Sums the rolling spend on classic jobs over the last week compared to the previous week, showing the WoW change.
  * **How it will be useful**: Identifies short-term spikes in automated pipelines.
* **Active Jobs**
  * **What it does / provides**: Counts distinct classic jobs run in the last 30 days.
  * **How it will be useful**: Measures workflow pipeline count.
* **Total Runs**
  * **What it does / provides**: Counts classic job execution runs in the last 30 days.
  * **How it will be useful**: Measures pipeline execution frequency and workload volume.

### 2. Metric Cards (Serverless Jobs)
* **30-Day Cost**
  * **What it does / provides**: Total cost for serverless jobs over the last 30 days.
  * **How it will be useful**: Tracks spend on workflows running on serverless infrastructure.
* **Last 7 Days**
  * **What it does / provides**: Sums serverless job spend in the last week compared to the previous week, showing the WoW change.
  * **How it will be useful**: Monitors serverless pipeline changes.
* **Active Jobs**
  * **What it does / provides**: Counts distinct serverless jobs run.
  * **How it will be useful**: Tracks the count of serverless pipelines.

### 3. Charts & Tables
* **Top Classic Jobs by Cost** (Chart & Table)
  * **What it does / provides**: A bar Plotly chart and accompanying detailed table ranking the top 10 most expensive classic workflows over 30 days.
  * **How it will be useful**: Targets specific automated workflows that are candidates for cluster resizing or migrating to serverless jobs.
* **8-Week Job Cost Trend**
  * **What it does / provides**: A line Plotly chart of rolling weekly costs of jobs over the last 8 weeks.
  * **How it will be useful**: Highlights gradual cost creep in data processing pipelines over time.
* **Top Serverless Jobs by Cost** (Chart & Table)
  * **What it does / provides**: A bar Plotly chart and accompanying detailed table ranking the top 10 serverless jobs by cost over 30 days.
  * **How it will be useful**: Tracks resource usage in serverless pipelines.
* **Failed Run Cost (30d)**
  * **What it does / provides**: A scatter Plotly chart tracking daily spend lost to failed job executions.
  * **How it will be useful**: Quantifies money wasted on jobs that errored out mid-run, prioritizing which pipelines need stabilization.

---

## SECTION 4 — SQL WAREHOUSES

This section monitors data warehousing, SQL query execution statistics, cache efficiency, and idle times.

### 1. Metric Cards
* **Classic WH (30d)**
  * **What it does / provides**: Cost of running classic SQL warehouses in the last 30 days.
  * **How it will be useful**: Monitors spend on SQL endpoints running on classic VM resources.
* **Serverless WH (30d)**
  * **What it does / provides**: Cost of running serverless SQL warehouses in the last 30 days.
  * **How it will be useful**: Monitors adoption and spend of serverless SQL warehouses.
* **MV Candidates**
  * **What it does / provides**: Counts queries run more than 50 times/day that scan more than 5GB of data.
  * **How it will be useful**: Identifies highly repetitive, heavy query patterns that should be converted into Materialized Views to save compute cost.
* **Repeat Queries**
  * **What it does / provides**: Count of identical queries run repeatedly without caching.
  * **How it will be useful**: Pinpoints inefficient application dashboard behaviors that run duplicate queries.
* **Wasted GB Scanned**
  * **What it does / provides**: Estimates the total volume of data scanned due to redundant query executions.
  * **How it will be useful**: Quantifies the database load and storage scanning overhead caused by missing query results caching.

### 2. Charts & Tables
* **Per-Warehouse Health Summary** (Table)
  * **What it does / provides**: Table displaying Warehouse ID, total query count, average execution duration, P90 duration, cache hit rate %, queued queries, failures, and total GB scanned over the last 7 days.
  * **How it will be useful**: Pinpoints underperforming warehouses (low cache hit, high queue times, high failures) that need scale adjustments.
* **Hourly Query Heatmap (7d)**
  * **What it does / provides**: A heatmap Plotly chart visualizing active query density by hour of day and day of week.
  * **How it will be useful**: Identifies peak concurrency hours to optimize warehouse auto-scaling schedules and size parameters.
* **Cache Hit Trend by Warehouse (7d)**
  * **What it does / provides**: A line Plotly chart tracking the daily cache hit rate percentage per warehouse.
  * **How it will be useful**: Monitors warehouse query efficiency; drops indicate shifting query patterns or missing query index structures.
* **Top 10 Expensive Queries (GB Scanned)** (Table)
  * **What it does / provides**: Lists the top 10 most resource-intensive individual query executions by user, scan size, duration, cache status, date, and query preview.
  * **How it will be useful**: Targets specific unoptimized queries that need index tuning or SQL query optimization.
* **Idle Warehouse Billing** (Table)
  * **What it does / provides**: Table identifying warehouses running with zero query activity, showing billed days, active days, idle days, idle percentage, total cost, and estimated idle cost.
  * **How it will be useful**: Quantifies waste due to long auto-stop timeouts, helping configure shorter timeouts to save cost.

---

## SECTION 5 — QUERY INTELLIGENCE

This section audits detailed database query execution metrics to detect inefficiencies like memory spilling, cache bypasses, and data shuffles.

### 1. Metric Cards
* **Spill Events**
  * **What it does / provides**: Count of query executions that spilled data to local disk due to memory limits.
  * **How it will be useful**: Warns when query execution is severely throttled by disk spills, suggesting clusters/warehouses need larger node types.
* **Total Spill GB**
  * **What it does / provides**: Total volume of data spilled to disk in the last 7 days.
  * **How it will be useful**: Quantifies the scale of memory bottlenecks across the workspace.
* **Cache-Breakers**
  * **What it does / provides**: Counts queries containing volatile functions (like `CURRENT_DATE()` or `RAND()`) that bypass result caching.
  * **How it will be useful**: Tells developers to rewrite queries with static inputs so they can be cached.
* **MV Candidates**
  * **What it does / provides**: Count of queries run more than 50 times/day scanning more than 5GB of uncached data.
  * **How it will be useful**: Points to queries that would benefit from Materialized Views.
* **Avg Shuffle Ratio**
  * **What it does / provides**: Task execution time divided by total query duration.
  * **How it will be useful**: Measures join or serialization efficiency; high values indicate high data shuffle network overhead.

### 2. Charts & Tables
* **Spill & Skew Detection** (Panel containing Chart & Table)
  * **What it does / provides**: Contains a bar Plotly chart (`Spill-to-Disk per Query Event (GB)`) showing daily spill sizes and a table (`Top Spill Offenders`) showing users, spill GB, read GB, spill %, and duration.
  * **How it will be useful**: Helps identify specific users running queries with insufficient executor memory.
* **Repeat Query & Materialized View Candidates** (Panel containing Chart & Table)
  * **What it does / provides**: Contains a scatter Plotly chart (`Query Frequency × GB Scanned`) showing query runs vs avg GB per run and a table (`Candidate Queries`) showing candidate details.
  * **How it will be useful**: Graphically and textually highlights query candidates that can be materialized to save resource consumption.
* **Cache-Breaker Patterns per User** (Panel containing Chart)
  * **What it does / provides**: Contains a horizontal bar Plotly chart (`Cache-Breaker Queries per User`) and audit tip text.
  * **How it will be useful**: Helps target user education to avoid volatile SQL syntax that disables caching.
* **Shuffle Ratio Trend** (Panel containing Chart)
  * **What it does / provides**: Contains a multi-line Plotly chart (`Task/Total Duration Ratio — Shuffle Pressure Indicator`) tracking shuffle overhead over time per warehouse.
  * **How it will be useful**: Monitors network distribution bottleneck trends.

---

## SECTION 6 — DLT (Delta Live Tables)

This section monitors the health and billing of Delta Live Tables (DLT) batch and streaming pipelines.

### 1. Metric Cards
* **Classic DLT (30d)**
  * **What it does / provides**: Billing cost of Delta Live Table pipelines running on classic compute resources in the last 30 days.
  * **How it will be useful**: Measures cost of traditional DLT pipeline runs.
* **Serverless DLT (30d)**
  * **What it does / provides**: Billing cost of DLT pipelines running on serverless compute in the last 30 days.
  * **How it will be useful**: Tracks adoptability and costs of serverless DLT workloads.
* **Total Pipelines**
  * **What it does / provides**: Count of distinct classic and serverless DLT pipelines active in the last 30 days.
  * **How it will be useful**: Measures total active pipeline volume.
* **Failed Runs (7d)**
  * **What it does / provides**: Total failed pipeline executions over the last 7 days.
  * **How it will be useful**: Monitors overall DLT pipeline execution stability.
* **Degrading Pipelines**
  * **What it does / provides**: Counts pipelines with more than 10% average runtime growth week-over-week.
  * **How it will be useful**: Detects performance degradation or data backpressure in pipeline workloads.

### 2. Charts & Tables
* **Classic DLT Daily Cost by Tier**
  * **What it does / provides**: A stacked bar Plotly chart showing daily Classic DLT spend broken down by tier (`Advanced`, `Pro`, `Core`).
  * **How it will be useful**: Helps verify if DLT pipelines are configured with correct product tiers, saving money on unused features.
* **Serverless DLT Daily Cost**
  * **What it does / provides**: A line/scatter Plotly chart tracking daily spend on serverless DLT pipelines.
  * **How it will be useful**: Tracks daily serverless DLT spending trends.
* **Top Classic Pipelines by Cost**
  * **What it does / provides**: A bar Plotly chart displaying top 10 Classic DLT pipelines ranked by 30-day billing cost.
  * **How it will be useful**: Targets high-cost pipelines for refactoring or tier optimization.
* **Pipeline Run Health (7d)** (Table)
  * **What it does / provides**: Table showing pipelines, run count, average run duration in minutes, failed run count, and failure rate percentage.
  * **How it will be useful**: Highlights unstable pipeline runs that waste compute resources.

---

## SECTION 7 — MERGE & CLUSTERING

This section tracks incremental database merge operations, liquid clustering optimization benefits, and the small-file footprint of ingestion jobs.

### 1. Metric Cards
* **Avg Cost Growth**
  * **What it does / provides**: Average week-over-week growth rate in MERGE query execution costs over 8 weeks.
  * **How it will be useful**: Identifies creep in data-merging costs, suggesting table layout degradation.
* **Max Write Variance**
  * **What it does / provides**: Maximum variation in cost between the fastest and slowest executions of the same MERGE job.
  * **How it will be useful**: High variance suggests write amplification issues.
* **LC Candidates**
  * **What it does / provides**: Count of jobs identified as high-priority candidates for Liquid Clustering (cost growing and high frequency).
  * **How it will be useful**: Targets tables that should be migrated to Liquid Clustering to reduce file write/scan amplification.
* **Small File Tables**
  * **What it does / provides**: Count of tables containing a high ratio of small files (less than 100MB per file with >1000 files and <100GB total size).
  * **How it will be useful**: Flags tables suffering from "small file problems", which severely degrades query performance and increases storage charges.

### 2. Charts & Tables
* **Job Cost Trend (8 Weeks)**
  * **What it does / provides**: A line Plotly chart tracking rolling weekly costs of MERGE jobs over 8 weeks.
  * **How it will be useful**: Visualizes cost creep trends to justify optimisations (e.g. running OPTIMIZE or migrating to Liquid Clustering).
* **Liquid Clustering Candidates** (Panel containing Chart & Table)
  * **What it does / provides**: A horizontal bar Plotly chart (`Liquid Clustering Candidates`) and a table (`Top LC Candidates`) showing job, active days, cost, average daily cost, and trend.
  * **How it will be useful**: Provides a prioritized list of jobs and tables to migrate to Liquid Clustering.
* **Write Amplification (Run Cost Variance)** (Panel containing Chart)
  * **What it does / provides**: A bar Plotly chart (`Write Amplification — Run Cost Variance % (High = Full-Table Rewrites)`).
  * **How it will be useful**: Identifies jobs that rewrite unchanged records, wasting compute DBUs.
* **PySpark Write Output File Audit** (Panel containing Table)
  * **What it does / provides**: Table displaying schema, table, size in GB, estimated files count, last altered date, and recommendation tips.
  * **How it will be useful**: Audits tables written by PySpark for small file counts, indicating compact or repartition optimization requirements.

---

## SECTION 8 — STORAGE

This section audits file storage trends, Delta table sizes, data-risk levels, and database house-keeping compliance (e.g., VACUUM audits).

### 1. Metric Cards
* **Storage Cost (30d)**
  * **What it does / provides**: Total storage cost (DBFS + Delta tables) in the last 30 days.
  * **How it will be useful**: Monitors the overall storage spend and growth rate.
* **HIGH Zombie Risk**
  * **What it does / provides**: Count of tables with high volume of unreferenced/stale historical files (no updates or optimizations in over 30 days).
  * **How it will be useful**: Highlights tables accumulating zombie files that burn storage budgets.
* **Overdue VACUUM (>30d)**
  * **What it does / provides**: Count of tables whose last `VACUUM` operation was more than 30 days ago.
  * **How it will be useful**: Pinpoints tables accumulating old historical file versions and unneeded transaction logs.
* **Retain-0 Violations**
  * **What it does / provides**: Count of tables configured with `RETAIN 0 HOURS` configuration.
  * **How it will be useful**: Highlights tables risking data loss if a write job fails, indicating data safety compliance violations.
* **Total Tables Tracked**
  * **What it does / provides**: Total count of Delta tables tracked in this workspace.
  * **How it will be useful**: Represents the catalog size.

### 2. Charts & Tables
* **Daily Storage Cost Trend**
  * **What it does / provides**: A line Plotly chart tracking daily storage costs over time.
  * **How it will be useful**: Identifies gradual accumulation trends.
* **Largest Tables by Size**
  * **What it does / provides**: A horizontal bar Plotly chart showing the largest tables in the workspace, color-coded by zombie risk.
  * **How it will be useful**: Identifies which tables are consuming the most storage space.
* **Zombie File Risk by Table** (Table)
  * **What it does / provides**: Table displaying table name, size in GB, file count, zombie risk rating, and days since last VACUUM.
  * **How it will be useful**: Provides an actionable checklist for running compacting and vacuuming routines.

---

## SECTION 9 — TAGGING & CHARGEBACK

This section audits cost attribution, department tagging coverage, and projections to enforce financial transparency and support cloud billing chargebacks.

### 1. Metric Cards
* **Attributed Cost**
  * **What it does / provides**: Compute cost with a valid team tag in the last 30 days.
  * **How it will be useful**: Measures the volume of spend that can be accurately mapped to departments.
* **Unattributed Cost**
  * **What it does / provides**: Compute cost missing team tags (shadow spend) in the last 30 days.
  * **How it will be useful**: Pinpoints untracked costs that cannot be charged back.
* **Tag Coverage**
  * **What it does / provides**: Percentage of total compute cost that contains valid team tags.
  * **How it will be useful**: Monitors compliance against target (80%+).
* **Teams Tracked**
  * **What it does / provides**: Count of distinct team tags found in billing logs.
  * **How it will be useful**: Displays department representation in chargebacks.
* **Clusters Tracked**
  * **What it does / provides**: Total count of active classic and serverless clusters audited.
  * **How it will be useful**: Shows the scale of audited resources.

### 2. Charts & Tables
* **30-Day Spend by Team**
  * **What it does / provides**: A horizontal bar Plotly chart (`Team Spend (30 days)`) displaying spend attributed to each team.
  * **How it will be useful**: Directly enables financial chargebacks to the correct teams.
* **Cluster Team Tag Coverage**
  * **What it does / provides**: A donut Plotly chart (`Tag Coverage`) showing the proportion of fully tagged vs incomplete clusters.
  * **How it will be useful**: Visualizes tag policy compliance.
* **Quarterly Cost Projection**
  * **What it does / provides**: A grouped bar Plotly chart (`Team Spend vs Quarterly Projection`) comparing actual 30-day costs with projected quarterly run rates.
  * **How it will be useful**: Helps departments forecast their cloud spend.
* **Per-User Cost Leaderboard** (Panel containing Chart)
  * **What it does / provides**: An expandable panel with a horizontal bar Plotly chart (`Per-User 30-Day Cost Leaderboard`) showing cost by user email and origin product.
  * **How it will be useful**: Pinpoints specific individuals driving high query or compute costs.
* **Clusters Needing Tags** (Table)
  * **What it does / provides**: Table displaying cluster ID, name, and presence/absence of Team, Project, and Environment tags.
  * **How it will be useful**: Action list for administrators to enforce tagging policies.
