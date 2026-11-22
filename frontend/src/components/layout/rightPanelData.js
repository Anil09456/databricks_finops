// Generated automatically from components/right_panel.py and config/notebook_config.py. Do not edit directly.

export const CHART_TITLES = {
  "daily_cost_product": "Daily Cost by Product (90 days)",
  "spend_by_product": "Spend by Product",
  "cost_anomaly_detect": "Cost Anomaly Detection (14 days)",
  "classic_daily_cost": "Daily Classic Compute Cost",
  "classic_cost_by_team": "Cost by Team (Classic)",
  "serverless_ic_daily": "Daily Serverless Interactive Cost",
  "classic_jobs_bar": "Top Classic Jobs by Cost",
  "classic_jobs_daily": "Daily Classic Job Cost",
  "serverless_jobs_bar": "Top Serverless Jobs by Cost",
  "serverless_jobs_daily": "Daily Serverless Job Cost",
  "wh_health_table": "Warehouse Health Scorecard",
  "cache_trend": "Cache Hit Rate Trend",
  "hourly_heatmap": "Hourly Query Load",
  "top_queries": "Top Expensive Queries",
  "classic_wh_daily": "Daily Classic Warehouse Cost",
  "serverless_wh_daily": "Daily Serverless Warehouse Cost",
  "classic_dlt_daily": "Daily Classic DLT Cost",
  "classic_dlt_by_tier": "Cost by DLT Tier",
  "serverless_dlt_daily": "Daily Serverless DLT Cost",
  "storage_cost_area": "Storage Cost Trend",
  "table_sizes_bar": "Table Sizes",
  "team_spend_bar": "Team Spend (Chargeback)",
  "tag_coverage_donut": "Tag Coverage",
  "quarterly_proj_bar": "Quarterly Projection",
  "sku_wow_heatmap": "SKU WoW Cost Change",
  "session_scan_trend": "GB Scanned per Interactive Session",
  "job_failed_cost": "Wasted Cost on Failed Job Runs",
  "job_8week_trend": "8-Week Job Cost Trend",
  "idle_billing": "Warehouse Idle Billing %",
  "dlt_run_duration": "DLT Pipeline Run Duration Trend",
  "dlt_run_results": "DLT Run Results (Failed vs Succeeded)",
  "vacuum_compliance": "VACUUM Compliance by Table",
  "user_cost_leaderboard": "Per-User Cost Leaderboard",
  "spill_events_bar": "Spill-to-Disk Events",
  "repeat_query_scatter": "Repeat Query / MV Candidates",
  "cache_breaker_bar": "Cache-Breaker Queries per User",
  "shuffle_ratio_line": "Task/Total Duration Ratio (Shuffle Proxy)",
  "merge_cost_trend": "8-Week Job Cost Trend (MERGE Degradation)",
  "lc_candidates_bar": "Liquid Clustering Candidates",
  "write_amp_bar": "Write Amplification \u2014 Run Cost Variance",
  "pyspark_write_audit": "PySpark Write Output File Audit"
};

export const CHART_INTEL = {
  "daily_cost_product": {
    "what": "Tracks daily DBU spend broken down by Databricks product (ALL_PURPOSE, JOBS, SQL, DLT, STORAGE) over 90 days.",
    "signals": ["Sudden spikes in any single product line", "Consistent upward slope across all SKUs", "Weekend cost not dropping to near-zero for batch jobs"],
    "impact": "A 10% week-over-week cost increase unchecked for a month compounds to 46% monthly overspend.",
    "cadence": "Review weekly. Alert if any product line grows >15% WoW."
  },
  "spend_by_product": {
    "what": "Donut breakdown of MTD spend by product. Reveals which workload type is the biggest cost driver.",
    "signals": ["ALL_PURPOSE >40% of total → likely idle interactive clusters", "STORAGE >20% → zombie files or unvacuumed tables", "JOBS spike → runaway scheduled pipelines"],
    "impact": "Reallocating idle ALL_PURPOSE spend to serverless can cut interactive costs by 30–60%.",
    "cadence": "Review monthly. Investigate if dominant segment shifts >10 percentage points."
  },
  "cost_anomaly_detect": {
    "what": "14-day rolling anomaly band — flags days where spend exceeded 1.3× the trailing 7-day average.",
    "signals": ["Red bands on consecutive days → systemic runaway, not a one-off spike", "Anomaly on Monday → weekend job ran unexpectedly", "Anomaly correlates with a deployment date → new pipeline without cost guardrails"],
    "impact": "Each anomaly day represents, on average, 30% excess spend vs. baseline. 4 anomalies/month = ~$X wasted.",
    "cadence": "Daily check. Any CRITICAL anomaly should be triaged within 24 hours."
  },
  "classic_daily_cost": {
    "what": "Daily ALL_PURPOSE cluster costs. Should show clear weekday/weekend patterns for interactive workloads.",
    "signals": ["Flat weekend costs → clusters not auto-terminating", "Rising baseline week-over-week → new always-on clusters added", "Spike mid-week → user ran a large ad-hoc job on an interactive cluster"],
    "impact": "Auto-termination alone (set to 10–30 min) can recover 20–40% of ALL_PURPOSE spend.",
    "cadence": "Review Monday morning for previous week. Alert if any single day >2× average."
  },
  "classic_cost_by_team": {
    "what": "Ranks teams by their ALL_PURPOSE cluster spend. Enables internal chargeback and accountability.",
    "signals": ["One team >50% of total → concentration risk", "Untagged clusters appearing → shadow spend outside budget controls", "Team cost growing without corresponding output → investigate utilization"],
    "impact": "Teams with chargeback visibility reduce spend 15–25% within 30 days (accountability effect).",
    "cadence": "Weekly team digest. Monthly chargeback report for budget owners."
  },
  "serverless_ic_daily": {
    "what": "Daily serverless notebook session costs (billing_origin_product=INTERACTIVE). Reflects Databricks serverless compute for ad-hoc analysis.",
    "signals": ["Flat high cost → sessions not releasing compute after inactivity", "Spikes on specific days → large data exploration jobs running in notebooks instead of jobs"],
    "impact": "Serverless sessions are billed per-second but idle time still accrues. Session idle timeout policies can cut costs 20–35%.",
    "cadence": "Review weekly. Implement idle timeout policies if daily cost >$X."
  },
  "session_scan_trend": {
    "what": "Average GB scanned per interactive session over 14 days. High GB scanned = full table scans, no partition pruning.",
    "signals": ["Upward trend → queries becoming less selective over time", "Sudden spike → new unoptimized query pattern introduced", "Consistently >10 GB/session → candidates for Materialized Views or caching"],
    "impact": "Reducing scan volume from 20GB to 2GB per query saves ~90% of compute cost for that workload.",
    "cadence": "Review weekly. Target <5 GB avg per session for well-optimized workloads."
  },
  "classic_jobs_bar": {
    "what": "Top classic job pipelines ranked by 30-day cost. Identifies the highest-leverage optimization targets.",
    "signals": ["Top job >30% of total jobs spend → single point of failure and cost concentration", "Multiple jobs in same team → candidate for job consolidation", "Job cost growing weekly → data volume or logic complexity unchecked"],
    "impact": "Optimizing top 3 jobs typically recovers 40–60% of total jobs spend.",
    "cadence": "Weekly. Engage job owner if cost >$500/month without SLA justification."
  },
  "job_failed_cost": {
    "what": "DBU cost burned on failed job runs. Compute was provisioned, clusters started, but produced zero output.",
    "signals": ["High wasted cost → missing retry logic with exponential backoff", "Failures on same job repeatedly → code bug or dependency issue not being fixed", "Failures on large clusters → switch to smaller instance type for testing"],
    "impact": "Failed runs are 100% waste. Even 5% failure rate on a $10K/month jobs budget = $500/month pure loss.",
    "cadence": "Daily alert if any job fails >3 consecutive runs. Monthly waste report."
  },
  "job_8week_trend": {
    "what": "8-week rolling job compute cost trend. Detects gradual cost creep from data volume growth or logic degradation.",
    "signals": ["Linear upward slope → unchecked data growth with no partition management", "Step changes → new jobs added without cost review", "Declining trend after optimization → validate with data SLAs still met"],
    "impact": "8-week compounding at 5% weekly growth = 47% cost increase in 2 months unmitigated.",
    "cadence": "Monthly trend review with engineering teams. Alert if 4-week CAGR >10%."
  },
  "wh_health_table": {
    "what": "Warehouse-level scorecard: cache hit %, queue depth, P90 query latency, failed queries, GB scanned.",
    "signals": ["Cache hit <40% → result cache disabled or queries not cacheable (non-deterministic functions)", "Queue >10 → warehouse undersized or needs scaling policy adjustment", "P90 >5 min → long-running queries blocking the queue"],
    "impact": "Improving cache hit from 40% to 70% reduces effective compute cost by ~30% with same query volume.",
    "cadence": "Weekly scorecard review. Immediate action if P90 >10 min or queue >20."
  },
  "cache_trend": {
    "what": "Daily cache hit rate trend across SQL warehouses. Cache hits serve results instantly at zero compute cost.",
    "signals": ["Declining trend → new non-cacheable queries introduced (e.g., NOW(), RAND())", "Warehouse restart → cache warm-up period causing temporary dip"],
    "impact": "Each 10% improvement in cache hit rate delivers ~10% cost reduction for SQL warehouse workloads.",
    "cadence": "Daily monitoring. Investigate if cache rate drops >15% in a week."
  },
  "hourly_heatmap": {
    "what": "Query volume distribution by hour-of-day and day-of-week. Reveals peak demand periods and sizing opportunities.",
    "signals": ["High activity 9am–5pm only → night/weekend auto-suspend saves cost", "24/7 activity → always-on warehouse justified; check for idle billing", "Monday spikes → BI dashboard refresh storms"],
    "impact": "Right-sizing auto-suspend windows based on actual usage patterns saves 20–40% of warehouse costs.",
    "cadence": "Monthly load trend review. Adjust auto-suspend and cluster scaling policies quarterly."
  },
  "top_queries": {
    "what": "Most expensive individual queries by GB scanned and duration. Direct optimization targets.",
    "signals": ["Same user repeatedly → education opportunity on query best practices", "High GB, low duration → table scan without filters (fix with LIMIT or partitioning)", "High duration, low GB → complex joins or missing statistics"],
    "impact": "Optimizing top 5 queries typically recovers 30–50% of total warehouse compute cost.",
    "cadence": "Weekly review with query authors. Monthly optimization sprint for top 10 offenders."
  },
  "idle_billing": {
    "what": "% of warehouse billing time spent with zero active queries (idle). Pure compute waste.",
    "signals": [">30% idle → auto-suspend timeout set too long", "Idle spikes overnight → warehouse not suspending after business hours", "High idle on specific warehouses → consolidation opportunity"],
    "impact": "A warehouse idle 40% of its uptime = 40% of its cost producing zero value.",
    "cadence": "Weekly. Set auto-suspend to 5–10 min for interactive, 1–2 min for BI-only warehouses."
  },
  "classic_dlt_daily": {
    "what": "Daily cost trend for Classic DLT pipelines. Tracks infrastructure spend for batch data engineering.",
    "signals": ["Cost not correlating with data volume → pipeline overhead (startup/shutdown costs dominating)", "Weekend cost non-zero → continuous mode instead of triggered mode", "Gradual increase → upstream data growth without pipeline optimization"],
    "impact": "Switching from continuous to triggered DLT mode for batch pipelines saves typically 30–50%.",
    "cadence": "Weekly. Review if daily cost increases >20% without corresponding data volume growth."
  },
  "serverless_dlt_daily": {
    "what": "Daily cost for Serverless DLT pipelines. Serverless eliminates cluster management but requires careful pipeline scoping.",
    "signals": ["Flat high cost → pipeline running continuously with no new data", "Spikes → large backfill triggered accidentally", "Growing cost with stable data → DLT expectations generating excessive reprocessing"],
    "impact": "Properly scoped serverless DLT pipelines (triggered mode, right expectations) cost 40–60% less than equivalent classic DLT.",
    "cadence": "Daily for production pipelines. Alert if any pipeline cost doubles week-over-week."
  },
  "storage_cost_area": {
    "what": "Storage cost trend over time (DBFS, Delta tables, external storage). Storage is often a hidden cost driver.",
    "signals": ["Consistent growth without data retention policies → unbounded storage accumulation", "Spike after ETL job → large intermediate files not cleaned up", "High VACUUM_RUN costs → fragmented Delta tables needing optimization"],
    "impact": "Implementing data retention policies and OPTIMIZE/VACUUM schedules reduces storage costs 20–50%.",
    "cadence": "Monthly storage audit. Immediate action if growth rate >5% week-over-week."
  },
  "table_sizes_bar": {
    "what": "Largest tables by size. Identifies candidates for partitioning, archival, or liquid clustering.",
    "signals": ["Tables >1TB without partitioning → full scans expensive and slow", "Tables growing faster than business data growth → intermediate results not cleaned up", "High write amplification tables → Z-ORDER or Liquid Clustering needed"],
    "impact": "Partitioning a 1TB table by date can reduce individual query cost by 80–95% (scanning only relevant partitions).",
    "cadence": "Monthly table audit. Engage data owners if any table >500GB without documented retention policy."
  },
  "team_spend_bar": {
    "what": "Cross-product spend attributed by team tag. The foundation for internal FinOps chargeback.",
    "signals": ["Team with no spend → missing tag coverage, spend hidden in untagged clusters", "Single team >60% → concentration risk, budget conversations needed", "Teams with high spend and no SLAs defined → cost accountability gap"],
    "impact": "Organizations with team-level chargeback reduce total cloud spend 15–30% within 6 months.",
    "cadence": "Monthly chargeback report. Quarterly budget review with each team lead."
  },
  "tag_coverage_donut": {
    "what": "% of compute resources with complete team attribution tags. Low coverage = invisible spend.",
    "signals": ["Coverage <80% → significant spend outside budget controls", "Coverage dropping → new resources created without tagging enforcement", "Specific product (JOBS, DLT) low coverage → pipeline automation missing tag injection"],
    "impact": "Every 1% of untagged spend is invisible to budget owners. At $100K/month, 20% untagged = $20K/month black box.",
    "cadence": "Weekly. Enforce tagging via cluster policies and job cluster configurations."
  },
  "sku_wow_heatmap": {
    "what": "Week-over-week cost change heatmap by Databricks SKU. Instantly spots which products are accelerating in cost.",
    "signals": ["Multiple SKUs red simultaneously → platform-wide event (migration, new workloads)", "Single SKU red → targeted investigation needed", "Green across all SKUs → healthy spend trajectory"],
    "impact": "Catching a 30% WoW spike in week 1 vs week 4 prevents 4× the overspend accumulation.",
    "cadence": "Every Monday. Set alerts for any SKU >20% WoW."
  },
  "cache_breaker_bar": {
    "what": "Users generating the most cache-busting queries (non-deterministic functions, frequent schema changes).",
    "signals": ["Small number of users responsible for most cache misses → targeted education high-ROI", "BI tool user → report query template using NOW() or CURRENT_TIMESTAMP()", "Data engineer → parameterized queries not using cache-friendly patterns"],
    "impact": "Fixing cache-busting patterns for top 3 users can improve cache hit rate by 15–25%.",
    "cadence": "Monthly review. Outreach to top cache-busters with optimization guidelines."
  },
  "spill_events_bar": {
    "what": "Disk spill events by query or user — indicates queries exceeding memory, falling back to slower disk I/O.",
    "signals": [">10 spill events/day → queries need more memory or better partitioning", "Spill on specific warehouse → instance type too small for workload", "Spill correlating with peak hours → concurrent queries competing for memory"],
    "impact": "Spill-to-disk slows queries 3–10× and increases cluster time, raising DBU cost proportionally.",
    "cadence": "Weekly. Address if any query spills >5GB to disk regularly."
  },
  "repeat_query_scatter": {
    "what": "Scatter of query frequency vs. GB scanned. Top-right quadrant = Materialized View (MV) candidates.",
    "signals": ["Query running >50×/day scanning >5GB each → perfect MV candidate", "Cluster of BI tool queries → dashboard can be pre-materialized", "High-frequency, low-GB queries → good caching candidates instead of MVs"],
    "impact": "A single MV on a repeat-scan pattern saves (frequency × GB × cost_per_GB) per day — often $1,000+/month per pattern.",
    "cadence": "Monthly. Implement MVs for top 5 repeat patterns. Review quarterly."
  },
  "shuffle_ratio_line": {
    "what": "Ratio of shuffle (network data exchange) time to total task duration — proxy for expensive join/groupBy operations.",
    "signals": ["Ratio >0.7 → most compute time is network shuffle, not actual computation", "Rising trend → data skew growing or new unoptimized joins introduced", "Spike after deployment → new query pattern causing broadcast join threshold misses"],
    "impact": "Reducing shuffle ratio from 0.8 to 0.3 can cut execution time (and cost) by 50–60%.",
    "cadence": "Weekly for high-cost pipelines. Investigate immediately if ratio >0.8."
  },
  "merge_cost_trend": {
    "what": "8-week cost trend for MERGE/update-heavy jobs. MERGE on large tables is one of the most expensive Delta operations.",
    "signals": ["Growing cost without data growth → MERGE table fragmentation accumulating", "Weekly spikes → MERGE running on unfragmented table, needs OPTIMIZE before MERGE", "Cost plateau after optimization → liquid clustering working effectively"],
    "impact": "OPTIMIZE before MERGE on a 100GB table reduces MERGE cost by 60–80% consistently.",
    "cadence": "Weekly. Run OPTIMIZE on any table that receives MERGE operations with >1M rows/day."
  },
  "lc_candidates_bar": {
    "what": "Tables with high write amplification that are candidates for Liquid Clustering migration from Z-ORDER.",
    "signals": ["Tables with >100 files written per OPTIMIZE run → Z-ORDER over-partitioned", "Tables with frequent small file issues → Liquid Clustering eliminates manual OPTIMIZE", "High candidate count → significant engineering time spent on manual optimization"],
    "impact": "Liquid Clustering eliminates the need for explicit OPTIMIZE calls, reducing maintenance cost 40–70% for high-churn tables.",
    "cadence": "Monthly assessment. Migrate top 3 candidates per quarter."
  },
  "vacuum_compliance": {
    "what": "VACUUM compliance status per table — identifies tables accumulating stale Delta versions and ghost files.",
    "signals": ["Non-compliant tables → storage cost growing due to unreferenced files", "Large non-compliant tables → higher query planning overhead (too many Delta log entries)", "Tables with RETAIN 0 risk → aggressive VACUUM with no recovery window"],
    "impact": "Tables not VACUUMed accumulate stale files at 5–30% of active data size per month.",
    "cadence": "Weekly automated VACUUM runs. Alert if any table >90 days without VACUUM."
  },
  "user_cost_leaderboard": {
    "what": "Per-user compute cost across all products. Identifies highest-spend individuals for targeted optimization.",
    "signals": ["Top user >20% of total cost → single point of risk and optimization opportunity", "New user suddenly top-ranked → unreviewed workload running at scale", "Users with high cost and no team tag → shadow spend outside governance"],
    "impact": "User-level visibility with self-service cost dashboards reduces individual user spend 10–20%.",
    "cadence": "Monthly leaderboard digest sent to users and their managers."
  }
};

export const MODULE_WHY = {
  0: [
    "📊 <strong>Cost allocation baseline</strong> — queries <code>system.billing.usage</code> to attribute spend by team, product, and SKU across the entire workspace",
    "🗂 <strong>Contains</strong>: MTD spend by product, 30/60/90-day trend tables, team-level chargeback summary, untagged spend percentage",
    "📤 <strong>Output</strong>: Heatmap of spend concentration, top-5 cost drivers, baseline benchmark for all downstream modules",
    "👥 <strong>Action owner</strong>: FinOps lead / platform team — run first before any other optimization module",
    "💡 <strong>Savings potential</strong>: Indirect — enables all targeted optimizations; typically unlocks 20–40% total savings when actioned"
  ],
  1: [
    "🔍 <strong>Zombie cluster detection</strong> — scans cluster event logs for clusters running >2h with zero task activity or no attached notebook",
    "🗂 <strong>Contains</strong>: Cluster uptime vs. active task ratio, auto-termination compliance check, orphaned cluster inventory with owner lookup",
    "📤 <strong>Output</strong>: List of clusters to terminate immediately, recommended auto-termination timeout values per team",
    "👥 <strong>Action owner</strong>: Platform engineers — enforce via cluster policies or direct termination",
    "💡 <strong>Savings potential</strong>: 15–30% of ALL_PURPOSE spend recoverable in workspaces with weak auto-termination governance"
  ],
  2: [
    "🔬 <strong>Full table scan audit</strong> — analyzes <code>query.history</code> for high GB-scanned queries missing partition filters or predicate pushdown",
    "🗂 <strong>Contains</strong>: Top 20 scan-heavy queries ranked by GB, partition column recommendations, missing statistics detection",
    "📤 <strong>Output</strong>: SQL rewrites with partition pruning, ANALYZE TABLE recommendations, list of tables needing Z-ORDER or clustering",
    "👥 <strong>Action owner</strong>: Data engineers and SQL analysts — query-level refactoring with guardrails",
    "💡 <strong>Savings potential</strong>: 50–90% scan cost reduction per query; high-ROI when top-3 queries scan >10GB each"
  ],
  3: [
    "📐 <strong>Interactive cluster sizing</strong> — correlates peak concurrent user sessions against actual cluster node utilization from Ganglia metrics",
    "🗂 <strong>Contains</strong>: Peak concurrency analysis (hourly), driver vs. executor utilization %, recommended node count and instance type per cluster",
    "📤 <strong>Output</strong>: Right-sizing recommendations with projected DBU savings, instance type comparison (memory-optimized vs. compute-optimized)",
    "👥 <strong>Action owner</strong>: Team leads and platform engineers — apply changes via cluster edit or policy update",
    "💡 <strong>Savings potential</strong>: 20–45% cost reduction for over-provisioned interactive clusters with <40% avg utilization"
  ],
  4: [
    "🛡 <strong>Auto-termination policy builder</strong> — generates Databricks cluster policy JSON with team-specific idle timeouts and max lifetime limits",
    "🗂 <strong>Contains</strong>: Current policy audit, idle timeout distribution across clusters, policy templates for dev/prod/BI cluster profiles",
    "📤 <strong>Output</strong>: Ready-to-deploy cluster policy configs, rollout checklist, monitoring queries to verify compliance post-deployment",
    "👥 <strong>Action owner</strong>: Platform/infra team — deploy policies via Databricks workspace admin console or Terraform",
    "💡 <strong>Savings potential</strong>: 20–40% ALL_PURPOSE spend recovery; compounds monthly as policy self-enforces on new clusters"
  ],
  5: [
    "⚙️ <strong>Task-level job observability</strong> — drills into Spark task metrics to identify slow stages, skewed partitions, and retry storms",
    "🗂 <strong>Contains</strong>: Stage duration breakdown, shuffle read/write bytes, failed task retry counts, top-skewed partition analysis",
    "📤 <strong>Output</strong>: Specific stage optimizations, repartition() recommendations, AQE (Adaptive Query Execution) config tuning",
    "👥 <strong>Action owner</strong>: Data engineers — code-level fixes in job notebooks or pipeline scripts",
    "💡 <strong>Savings potential</strong>: 30–60% runtime reduction on skew-heavy jobs translates directly to proportional DBU cost savings"
  ],
  6: [
    "🏗 <strong>Materialized View candidate finder</strong> — identifies query patterns running >50×/day scanning the same tables with >5GB per execution",
    "🗂 <strong>Contains</strong>: Repeat query fingerprint analysis, candidate MV definitions with CREATE MATERIALIZED VIEW SQL templates, refresh schedule recommendations",
    "📤 <strong>Output</strong>: Priority-ranked MV candidates, estimated cost savings per MV, dependency graph for refresh ordering",
    "👥 <strong>Action owner</strong>: SQL/BI engineers — create MVs in Unity Catalog; BI team to point dashboards at MV instead of base tables",
    "💡 <strong>Savings potential</strong>: $500–5,000+/month per high-frequency scan pattern eliminated; MVs amortize cost across all consumers"
  ],
  7: [
    "🧹 <strong>VACUUM compliance auditor</strong> — checks Delta table transaction logs for tables last VACUUMed >30 days ago and quantifies stale file accumulation",
    "🗂 <strong>Contains</strong>: Table-by-table VACUUM compliance status, stale file count & estimated GB, RETAIN 0 flag risk assessment",
    "📤 <strong>Output</strong>: Prioritized VACUUM script with safe retention windows, scheduled VACUUM job template for Databricks Workflows",
    "👥 <strong>Action owner</strong>: Data platform team — schedule recurring VACUUM jobs; data owners review RETAIN 0 usage",
    "💡 <strong>Savings potential</strong>: 10–40% storage cost reduction on tables with high churn (streaming, CDC, MERGE-heavy workloads)"
  ],
  8: [
    "🏭 <strong>SQL warehouse right-sizer</strong> — matches warehouse cluster size (2X-Small → 4X-Large) to actual peak query concurrency and P90 latency targets",
    "🗂 <strong>Contains</strong>: Per-warehouse utilization heatmap, scaling policy analysis, idle billing percentage, min/max cluster count recommendations",
    "📤 <strong>Output</strong>: Size-down or scale-up recommendations per warehouse, auto-suspend timeout settings, multi-cluster config for peak hours",
    "👥 <strong>Action owner</strong>: Data platform engineers — warehouse config changes via SQL Admin Console or API",
    "💡 <strong>Savings potential</strong>: 25–50% warehouse cost reduction when sizing matches actual concurrency; auto-suspend alone saves 20–35%"
  ],
  9: [
    "⚡ <strong>Liquid Clustering migration planner</strong> — identifies tables still using explicit OPTIMIZE/ZORDER that are candidates for Liquid Clustering",
    "🗂 <strong>Contains</strong>: Write amplification analysis per table, file count growth rate, Z-ORDER column effectiveness score, LC migration readiness checklist",
    "📤 <strong>Output</strong>: ALTER TABLE migration scripts, before/after file count projections, maintenance job elimination timeline",
    "👥 <strong>Action owner</strong>: Data engineers and DBA equivalent — table DDL migrations with Unity Catalog",
    "💡 <strong>Savings potential</strong>: Eliminates 100% of manual OPTIMIZE compute cost on migrated tables; reduces write overhead 40–70%"
  ],
  10: [
    "🔀 <strong>MERGE performance deep-dive</strong> — analyzes Delta MERGE operations for file fragmentation, predicate coverage, and rewrite amplification",
    "🗂 <strong>Contains</strong>: MERGE execution plan analysis, target table file count pre/post MERGE, merge predicate selectivity, WHEN NOT MATCHED INSERT cost",
    "📤 <strong>Output</strong>: Pre-MERGE OPTIMIZE scripts, merge predicate rewrites, recommended MERGE batch size and frequency tuning",
    "👥 <strong>Action owner</strong>: Data engineers — SQL MERGE statement rewrites and pipeline scheduling changes",
    "💡 <strong>Savings potential</strong>: OPTIMIZE before MERGE reduces merge cost 60–80%; predicate narrowing reduces 30–50% of files scanned"
  ],
  11: [
    "🏷 <strong>Tagging enforcement toolkit</strong> — audits cluster policies, job configurations, and DLT pipelines for missing or inconsistent team attribution tags",
    "🗂 <strong>Contains</strong>: Tag coverage by product (ALL_PURPOSE, JOBS, DLT, SQL), policy templates for mandatory tags, untagged resource inventory",
    "📤 <strong>Output</strong>: Cluster policy JSON with required custom tags, Terraform module for tag enforcement, tag compliance dashboard queries",
    "👥 <strong>Action owner</strong>: Platform engineers (policy deployment) + team leads (tag value governance)",
    "💡 <strong>Savings potential</strong>: Indirect — enables chargeback accountability that drives 15–25% team-level spend reduction within 30 days"
  ],
  12: [
    "⚖️ <strong>Serverless vs. classic cost modeler</strong> — runs side-by-side cost projection for same workload on classic clusters vs. Databricks serverless",
    "🗂 <strong>Contains</strong>: Workload classification (batch vs. interactive vs. streaming), DBU rate comparison, startup time analysis, break-even calculation",
    "📤 <strong>Output</strong>: Workload migration priority matrix, projected savings by switching, risk assessment (data locality, cold start latency)",
    "👥 <strong>Action owner</strong>: Platform architects and team leads — workload migration decisions require SLA sign-off",
    "💡 <strong>Savings potential</strong>: Serverless typically 30–60% cheaper for short-duration interactive workloads; classic cheaper for long-running steady-state jobs"
  ],
  13: [
    "🔄 <strong>DLT pipeline mode optimizer</strong> — identifies DLT pipelines running in continuous mode where triggered mode would suffice",
    "🗂 <strong>Contains</strong>: Pipeline run frequency analysis, data arrival rate vs. pipeline trigger rate, idle cluster time in continuous mode",
    "📤 <strong>Output</strong>: Pipeline-by-pipeline mode recommendation (continuous vs. triggered), trigger schedule templates, expected cost savings per pipeline",
    "👥 <strong>Action owner</strong>: Data engineers — DLT pipeline configuration changes in Databricks Workflows",
    "💡 <strong>Savings potential</strong>: Continuous→triggered switch saves 30–60% of DLT compute cost for pipelines with batch upstream data sources"
  ],
  14: [
    "📊 <strong>Query queue saturation analyzer</strong> — examines warehouse queue depth, peak concurrent queries, and queue wait time distribution",
    "🗂 <strong>Contains</strong>: Queue depth timeline (hourly), P50/P90/P99 wait times, queries killed due to timeout, scaling headroom analysis",
    "📤 <strong>Output</strong>: Multi-cluster scaling policy recommendations, warehouse split recommendations for mixed workloads, peak hour auto-scaling configs",
    "👥 <strong>Action owner</strong>: SQL admins and platform engineers — warehouse configuration and scaling policy changes",
    "💡 <strong>Savings potential</strong>: Proper sizing eliminates queue-driven SLA breaches without permanent over-provisioning; saves 15–30% vs. always-on large clusters"
  ],
  15: [
    "🔎 <strong>Cost anomaly root-cause tracer</strong> — correlates spend spike timestamps with job runs, cluster events, user activity, and deployment events",
    "🗂 <strong>Contains</strong>: Anomaly timeline with contributing events, top-5 spend contributors per anomaly day, deployment correlation analysis",
    "📤 <strong>Output</strong>: Root cause report per anomaly, recommended guardrails (budget alerts, cluster limits, job retry caps)",
    "👥 <strong>Action owner</strong>: FinOps lead + engineering team — guardrail implementation and post-incident review",
    "💡 <strong>Savings potential</strong>: Preventing repeat anomalies saves their full cost; anomaly guardrails typically prevent 70–90% of future spikes"
  ],
  16: [
    "🔗 <strong>Job consolidation analyzer</strong> — identifies groups of jobs sharing the same cluster type, schedule window, and data dependencies that can be merged",
    "🗂 <strong>Contains</strong>: Job dependency graph, cluster startup cost per job (amortization analysis), schedule overlap matrix, consolidation opportunity scoring",
    "📤 <strong>Output</strong>: Job merger recommendations with new DAG structure, estimated cluster startup cost savings, Databricks Workflows migration scripts",
    "👥 <strong>Action owner</strong>: Data engineers and pipeline owners — workflow redesign and testing",
    "💡 <strong>Savings potential</strong>: Cluster startup overhead is 2–5 min of full-cluster cost per job; consolidating 10 short jobs into 1 can save 60–80% of startup waste"
  ],
  17: [
    "🗄 <strong>Storage tier strategist</strong> — analyzes table access patterns to identify cold data that should be tiered to cheaper external storage or archived",
    "🗂 <strong>Contains</strong>: Table last-access timestamps, read frequency heatmap, storage cost per table, lifecycle policy recommendations",
    "📤 <strong>Output</strong>: Data archival candidates list, EXTERNAL LOCATION migration scripts, retention policy templates per table classification (hot/warm/cold)",
    "👥 <strong>Action owner</strong>: Data platform team and data owners — lifecycle governance decisions",
    "💡 <strong>Savings potential</strong>: Cold data storage on cheaper tiers (S3 IA, GCS Nearline) costs 50–70% less; high-value for 6+ month stale tables"
  ],
  18: [
    "🏗 <strong>System tables deep-dive</strong> — leverages <code>system.billing.usage</code>, <code>system.compute.clusters</code>, and <code>system.lakeflow</code> for atomic-level cost attribution",
    "🗂 <strong>Contains</strong>: SKU-level DBU breakdown by cluster/job/user, billing usage joined with cluster events, workspace-level spend allocation",
    "📤 <strong>Output</strong>: Custom cost attribution dashboard queries, showback/chargeback SQL views, audit-ready spend reports by business unit",
    "👥 <strong>Action owner</strong>: FinOps analysts — build persistent views for ongoing reporting; share with finance and team leads",
    "💡 <strong>Savings potential</strong>: Enables precision targeting — teams with detailed spend visibility reduce costs 20–30% faster than those using estimated allocations"
  ],
  19: [
    "📋 <strong>Compute policy blueprint generator</strong> — produces Databricks cluster policy JSON for dev, prod, and BI cluster profiles with cost guardrails baked in",
    "🗂 <strong>Contains</strong>: Policy templates (dev: small + aggressive auto-terminate, prod: fixed size + SLA protection, BI: serverless preferred), max DBU budget enforcement",
    "📤 <strong>Output</strong>: Ready-to-deploy policy JSON files, policy assignment matrix by team/use-case, Terraform/API deployment scripts",
    "👥 <strong>Action owner</strong>: Platform engineering and workspace admins — deploy and assign policies; team leads approve per-team policy overrides",
    "💡 <strong>Savings potential</strong>: Policy-enforced guardrails prevent cost runaway; organizations with mature policies spend 25–40% less than ungoverned workspaces"
  ]
};

export const MODULE_CELLS = {
  "0": {
    "name": "Setup",
    "intro": 1561959874304162,
    "tags": [
      "setup",
      "schema",
      "tables"
    ]
  },
  "1": {
    "name": "Caching \u2014 3 Layers",
    "intro": 1561959874304175,
    "tags": [
      "cache",
      "result cache",
      "disk cache",
      "sql warehouse"
    ]
  },
  "2": {
    "name": "Partitioning",
    "intro": 1561959874304184,
    "tags": [
      "partition",
      "scan",
      "filter",
      "date filter"
    ]
  },
  "3": {
    "name": "VACUUM + OPTIMIZE",
    "intro": 7812751700684417,
    "tags": [
      "vacuum",
      "optimize",
      "zombie files",
      "small files",
      "storage"
    ]
  },
  "4": {
    "name": "Narrow vs Wide Transforms",
    "intro": 1561959874304211,
    "tags": [
      "shuffle",
      "exchange",
      "transform",
      "repartition"
    ]
  },
  "5": {
    "name": "Task & Job Observability",
    "intro": 1561959874304219,
    "tags": [
      "spark ui",
      "job",
      "stage",
      "task",
      "observability"
    ]
  },
  "6": {
    "name": "Z-Order",
    "intro": 1561959874304226,
    "tags": [
      "z-order",
      "file skip",
      "data skipping",
      "high cardinality"
    ]
  },
  "7": {
    "name": "AQE",
    "intro": 1561959874304236,
    "tags": [
      "aqe",
      "adaptive",
      "skew",
      "broadcast threshold"
    ]
  },
  "8": {
    "name": "Broadcast Join",
    "intro": 1561959874304243,
    "tags": [
      "broadcast",
      "join",
      "sort merge join"
    ]
  },
  "9": {
    "name": "All 4 Join Types",
    "intro": 1561959874304250,
    "tags": [
      "join type",
      "smj",
      "shj",
      "nlj"
    ]
  },
  "10": {
    "name": "Liquid Clustering",
    "intro": 1561959874304260,
    "tags": [
      "liquid clustering",
      "merge",
      "cdc",
      "incremental"
    ]
  },
  "11": {
    "name": "Data Spill & Skew",
    "intro": 1561959874304272,
    "tags": [
      "spill",
      "skew",
      "oom",
      "out of memory",
      "hot key"
    ]
  },
  "12": {
    "name": "PySpark Optimized Writes",
    "intro": 1561959874304280,
    "tags": [
      "write",
      "pyspark",
      "output",
      "write layout"
    ]
  },
  "13": {
    "name": "Zombie Files",
    "intro": 1561959874304289,
    "tags": [
      "zombie",
      "orphan",
      "storage waste",
      "file cleanup"
    ]
  },
  "14": {
    "name": "Dashboard $18K/Month",
    "intro": 1561959874304301,
    "tags": [
      "materialized view",
      "mv",
      "pre-aggregate",
      "repeat query"
    ]
  },
  "15": {
    "name": "Warehouse Saturation",
    "intro": 1561959874304311,
    "tags": [
      "warehouse",
      "queue",
      "saturation",
      "max clusters"
    ]
  },
  "16": {
    "name": "MERGE INTO Degradation",
    "intro": 1561959874304320,
    "tags": [
      "merge",
      "merge into",
      "upsert",
      "pipeline cost"
    ]
  },
  "17": {
    "name": "Time Travel & Retention",
    "intro": 1561959874304327,
    "tags": [
      "time travel",
      "retention",
      "vacuum retain",
      "compliance"
    ]
  },
  "18": {
    "name": "System Tables Deep-Dive",
    "intro": 1561959874304337,
    "tags": [
      "system tables",
      "billing",
      "monitoring",
      "cost attribution"
    ]
  },
  "19": {
    "name": "Right-Sizing & Cluster Config",
    "intro": 1561959874304364,
    "tags": [
      "right-size",
      "cluster config",
      "instance type",
      "tagging"
    ]
  }
};
