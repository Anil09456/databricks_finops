# 🧭 FinOps Copilot — End User & Stakeholder Universe
### *Who Uses It, When, and Why — Across the Full Project Lifecycle*

> This document maps every persona who can derive value from FinOps Copilot, organized across the **five phases of a Databricks project lifecycle**. Think of it less as a user list and more as a *living conversation guide* — the right people, at the right time, with the right question.

---

## 🗺️ The Five-Phase Lifecycle at a Glance

```
Phase 1          Phase 2          Phase 3          Phase 4           Phase 5
─────────        ─────────        ─────────        ─────────         ─────────
Pre-Onboard  →   Dev & Build  →   QA & Testing →   Pre-Launch    →   Production Live
(Discovery)      (Engineering)    (Validation)     (Hardening)       (Operations)
```

---

## ⚡ Phase 1 — Pre-Onboarding: Before a Project Lands on Databricks
> *The team is evaluating whether to use Databricks for a new initiative. Budget allocation is being discussed. Architecture hasn't been finalized.*

### 👤 Persona 1 — The Cloud Architect / Solutions Architect
**Their question:** *"What does Databricks actually cost at our scale — before we commit to it?"*

They use the **Home Page Forecast** (3-month and 6-month projections) and the **Account-Level Overall Dashboard** to benchmark what similar workload patterns cost *today* across the organization. They can simulate cost trajectories for a new project by anchoring to what comparable job types cost per DBU. Instead of guessing with a spreadsheet, they walk into an architecture review with **a data-backed spend projection**.

**Specific features:**
- 3-Month AI Cost Forecast (Home Page)
- Overall MTD Spend + Anomaly Detection (to see the "noise floor" before adding more workloads)
- Interactive Compute spend by team (to understand current consumption patterns)

---

### 👤 Persona 2 — The IT Finance Manager / FinOps Analyst
**Their question:** *"Can we afford it? And what's the business case ROI?"*

This person is building the internal business case. They need projected monthly Databricks cost for the new project to put alongside engineering headcount costs, cloud infra costs, and expected business value. FinOps Copilot lets them pull **actual average cost-per-job-type** from existing workloads to project forward. They're not guessing — they're extrapolating from real organizational data.

**Specific features:**
- Chargeback Dashboard (to see average team-level cost baselines)
- 6-month cost trend + forecast (to identify seasonality and trend before committing budget)
- DBU pricing configuration (so they can model different pricing tiers)

---

### 👤 Persona 3 — The Procurement / Vendor Manager
**Their question:** *"Are we getting the right Databricks contract tier? Should we commit to reserved capacity?"*

By reviewing actual DBU consumption trends and product-type breakdowns (ALL_PURPOSE vs. JOBS vs. SQL vs. MODEL_SERVING), they can assess whether the current consumption pattern justifies a different commitment tier. They can identify which **billing products drive cost** before negotiating a new contract.

**Specific features:**
- Overall Dashboard — cost breakdown by Databricks product category
- Jobs Compute + SQL Warehouse cost curves

---

### 👤 Persona 4 — The Data Platform / Center of Excellence (CoE) Lead
**Their question:** *"What's our platform's current cost health baseline before we onboard another team?"*

Before saying "yes" to a new project, the CoE lead needs to know: Is the platform already over-consumed? Are there anomalies or cost spikes? What is the current FinOps Health Score? If the score is in the 🔴 Critical zone, they may delay onboarding until efficiency gaps are resolved.

**Specific features:**
- FinOps Health Score (0–100 with component breakdown)
- Cost Anomaly Detection (is there already unusual spend before we add workloads?)
- Cluster Tag Coverage Score (how well-governed is the current estate?)

---

## ⚙️ Phase 2 — Development: Engineers Building the Data Pipeline
> *The project is approved. A data engineering team is actively building pipelines, notebooks, SQL queries, and DLT pipelines. Costs are accumulating in real time.*

### 👤 Persona 5 — The Data Engineer
**Their question:** *"Is my notebook/job costing way more than it should while I develop?"*

Developers often spin up All-Purpose clusters, run iterative notebook experiments, and forget to terminate clusters. FinOps Copilot's **Interactive Compute dashboard** shows exactly which clusters are burning the most DBUs — and flags idle clusters. The **Cost Lookup** feature lets a developer type *their own name* and instantly see their personal compute spend for the current sprint.

**Specific features:**
- Interactive Compute Dashboard (who's spending what on All-Purpose clusters)
- Cost Lookup by User (type your username, see your spend today/this week/this month)
- ClusterDNA Log Analyzer — paste a local test run's logs → immediately get a health score and right-sizing recommendation before the job is promoted to production
- Notebook Intelligence Panel (📡) → directly jump from a chart showing inefficiency to the exact Databricks cell that fixes it

**Creative use case:** A developer finishes building a DLT pipeline. Before pushing to the QA environment, they run the driver logs through ClusterDNA and get: "Your executor memory is undersized — you're spilling 4.2 GB to disk on every run. Switch from m5.xlarge to m5.2xlarge workers and set `spark.sql.shuffle.partitions=200`." They fix it in dev. QA never sees the problem.

---

### 👤 Persona 6 — The ML Engineer / Data Scientist
**Their question:** *"My model training job is expensive. Is it worth it, and can I optimize it?"*

ML training jobs often run on large GPU or memory-optimized clusters with unpredictable runtimes. The **Jobs Compute Dashboard** shows cost-per-run and failed-run waste. If a training job fails 3 times before succeeding, FinOps Copilot surfaces exactly how much those failures cost — making the case for better retry logic or smaller dev-time checkpoints.

**Specific features:**
- Jobs Compute — Failed Run Waste metric
- ClusterDNA Log Analyzer (for training run OOM / executor loss detection)
- Model Serving Dashboard (once the model is deployed to an endpoint)

---

### 👤 Persona 7 — The DLT Pipeline Engineer
**Their question:** *"Is my Delta Live Tables pipeline running efficiently, or is it silently burning DBUs on expectation violations?"*

The **DLT Dashboard** uniquely surfaces **expectation violations degrading performance** — a pattern most engineers never catch. If a data quality rule fails on 30% of rows, DLT has to do extra processing. This engineer uses FinOps Copilot to detect that invisible cost multiplier before it ships.

**Specific features:**
- DLT Dashboard (Classic + Serverless pipeline cost, expectation violation rate)
- ClusterDNA with log4j-active.txt (DLT scheduler events and stage failures)

---

### 👤 Persona 8 — The Analytics Engineer / dbt Developer
**Their question:** *"My MERGE INTO operations are getting slower and more expensive over time. Why?"*

The **MERGE & Clustering Dashboard** directly answers this. It tracks the MERGE INTO cost trend over time and identifies which tables are now candidates for Liquid Clustering — the single most impactful structural change for MERGE-heavy workflows.

**Specific features:**
- MERGE & Clustering Dashboard — MERGE cost trend + Liquid Clustering candidates
- Storage Health Dashboard — Zombie file tables and VACUUM compliance

---

## 🧪 Phase 3 — Quality Assurance & Testing: Validating Before Promotion
> *The pipeline is functionally correct. The QA team is running performance tests, integration tests, and data quality checks. The question now is: does it perform efficiently at scale?*

### 👤 Persona 9 — The QA Engineer / Performance Tester
**Their question:** *"Does this pipeline perform acceptably at production data volume — and at what cost?"*

QA teams typically focus on data correctness, not compute efficiency. FinOps Copilot gives the QA engineer a second lens: **performance + cost**. After each test run, they can check ClusterDNA to see if the job shows shuffle spill, OOM patterns, or GC pressure under load — patterns that only appear at scale. A performance defect caught in QA is orders of magnitude cheaper to fix than one caught in production.

**Specific features:**
- ClusterDNA Log Analyzer (run after each major load test — structured health score gives a pass/fail cost signal)
- Jobs Compute Dashboard (compare cost-per-run across test iterations — is each refactor making it cheaper or more expensive?)
- Query Intelligence Dashboard (spill events, shuffle bottlenecks surfaced during QA load tests)

**Creative use case — the "Cost Regression Test":** QA makes ClusterDNA a mandatory step in the test checklist. Every promoted pipeline must achieve a ClusterDNA Health Score of ≥ 70 before it can move to staging. This turns cost into a testable quality gate, not an afterthought.

---

### 👤 Persona 10 — The Data Quality / Governance Analyst
**Their question:** *"Are our data pipelines producing clean output without silently burning extra compute on quality fixes?"*

DLT expectation violations, schema mismatches caught in `stdout.txt`, and row count anomalies in ClusterDNA's StdoutParser — all of these surface data quality issues that have a direct cost impact. This persona uses FinOps Copilot not for *financial* governance but for *data* governance — and discovers that the two are deeply connected.

**Specific features:**
- ClusterDNA StdoutParser (assertion failures, schema mismatches, row count anomalies)
- DLT Dashboard (expectation violation rate by pipeline)
- Storage Health → VACUUM compliance (un-vacuumed tables indicate governance gaps)

---

### 👤 Persona 11 — The DevOps / CI/CD Engineer
**Their question:** *"Can I integrate ClusterDNA into our CI/CD pipeline so cost health is checked automatically on every build?"*

ClusterDNA's `log_processor/` package is completely self-contained with **zero Streamlit dependency** — it can be imported as a Python module. A DevOps engineer can call `preprocessor.py` directly from a GitHub Actions workflow or Azure DevOps pipeline, parse the driver logs from a test run, and fail the build if the Health Score drops below a threshold.

**Specific features:**
- `log_processor/preprocessor.py` as a standalone Python module
- `log_processor/ai_engine.py` for automated AI recommendations in CI output
- Health Score as a programmable pass/fail signal

---

## 🚀 Phase 4 — Pre-Launch / Production Hardening: Final Checks Before Go-Live
> *Development is done, QA has signed off. The team is preparing for production launch. Governance, access control, cost budgets, and SLAs are being finalized.*

### 👤 Persona 12 — The Platform Engineer / SRE
**Their question:** *"Is this system going to stay within budget and performance SLAs once it goes live?"*

The Platform Engineer uses FinOps Copilot to establish **cost baselines** right before go-live. They configure the expected spend range using the anomaly detection parameters (1.3× threshold), so the moment production cost deviates on day 1, the alert fires. They also review cluster tag coverage — all production resources must be tagged for chargeback before launch.

**Specific features:**
- Cost Anomaly Detection (tune the detection threshold for the new production workload)
- Chargeback Dashboard → Cluster Tag Coverage Score (enforce 100% tag coverage as a launch gate)
- SQL Warehouse health metrics (ensure the warehouse serving the new workload has acceptable queue depth and cache hit rate)

---

### 👤 Persona 13 — The Cloud FinOps Manager / VP Engineering
**Their question:** *"What is the projected steady-state monthly cost for this new production workload, and does it fit within our budget?"*

In the final week before launch, this person reviews the 3-month AI cost forecast, cross-referenced with the QA test run costs. They want confidence that the production cost envelope matches what was promised in Phase 1's business case. If there's a gap, they need to decide: optimize before launch, or launch and optimize in month 1?

**Specific features:**
- 3-Month Cost Forecast (Home Page)
- Jobs Compute cost-per-run (extrapolated from QA test runs to production frequency)
- Overall FinOps Health Score (must be ≥ 80 before launch approval is granted)

**Creative use case — the "Launch Readiness Scorecard":** The FinOps Health Score becomes a formal launch gate. Leadership won't approve a production launch until the score is 🟢 80+. This makes the abstract concept of "cost health" concrete, measurable, and actionable.

---

### 👤 Persona 14 — The Security & Compliance Officer
**Their question:** *"Can I audit what resources are running, who owns them, and whether personal data is being processed in unauthorized clusters?"*

Untagged clusters are a **compliance risk**, not just a cost risk. If a cluster has no team tag, it's effectively anonymous — there's no accountability chain if it processes sensitive data. The Chargeback + Tag Coverage dashboard gives Compliance a direct view into governance gaps. Every untagged cluster is a potential audit finding.

**Specific features:**
- Chargeback Dashboard → Cluster Tag Coverage Score and untagged cluster list
- Cost Lookup by Cluster ID (identify specific anonymous resources)
- Storage Health → Zombie file tables (stale storage with potential PII is a compliance risk)

---

### 👤 Persona 15 — The Databricks Solution Architect (Partner or Internal)
**Their question:** *"Have we optimized the architecture enough? Are there structural inefficiencies I can catch before the client goes live?"*

A Databricks SA reviews the cluster configuration, warehouse sizing, and DLT pipeline structure for a client before launch. ClusterDNA's Gemini-generated right-sizing recommendation (with an exact Jobs API JSON payload) lets the SA hand the engineering team a ready-to-apply configuration change — not a vague suggestion, but a copy-pasteable cluster spec.

**Specific features:**
- ClusterDNA AI recommendations → Databricks Jobs API JSON payload
- Notebook Intelligence Panel (link engineers to runnable optimization demos)
- Overall + Jobs + Interactive dashboards (full workload picture)

---

## 🏭 Phase 5 — Production Live: Ongoing Operations
> *The project is live. Real users, real data, real costs. The platform team is responsible for keeping costs in check, performance within SLA, and governance tight — indefinitely.*

### 👤 Persona 16 — The FinOps / Cloud Cost Analyst (Day-to-Day Operator)
**Their question:** *"What happened to our Databricks bill this week?"*

This is the **primary day-to-day user** of FinOps Copilot. Every morning, they open the Overall Dashboard. They check: Is the FinOps Health Score stable? Are there any anomaly flags? What did we spend yesterday vs. the weekly average? This is their operational command center.

**Specific features:**
- All 10 Command Centre dashboards (rotating daily review)
- Cost Anomaly Detection (the early-warning system)
- Refresh button (to force-fetch latest data without waiting for cache expiry)
- 3-month cost forecast (weekly review to catch budget overrun trajectories early)

---

### 👤 Persona 17 — The Team Lead / Engineering Manager
**Their question:** *"How is my team's Databricks consumption tracking against our monthly budget?"*

Team leads are accountable for their team's cloud spend but rarely have good tooling to track it. The **Cost Lookup by Tag** feature lets a team lead filter by their team's cluster tag and see exactly what their team spent — today, this week, this month. No tickets, no waiting for a monthly invoice, no surprises.

**Specific features:**
- Cost Lookup by Tag (self-serve chargeback visibility)
- Chargeback Dashboard (their team's spend vs. organizational average)
- Jobs Compute → Failed Run Waste (how much is their team burning on retry failures?)

---

### 👤 Persona 18 — The On-Call SRE / Incident Responder
**Their question:** *"Something just caused a cost spike. What was it, and which team owns it?"*

At 2am, a Databricks cost alert fires. The on-call engineer opens FinOps Copilot. They check:
1. **Cost Anomaly Detection** — which product category spiked?
2. **Jobs Compute** — which specific job suddenly appeared at the top of cost ranking?
3. **Cost Lookup by Cluster ID** — what tag does this cluster have? Which team owns it?
4. **ClusterDNA** — paste the failed job's driver logs → instant diagnosis of what went wrong

This is a **war-room workflow** — from anomaly → root cause → ownership → fix — in one tool.

---

### 👤 Persona 19 — The SQL Analyst / BI Developer
**Their question:** *"My dashboards are slow. Is it the warehouse, the queries, or the data?"*

Production BI workloads running on SQL Warehouses often slow down as data volumes grow. The **SQL Warehouse Dashboard** surfaces exactly where the bottleneck is: Is the cache hit rate dropping? Is there queue contention when multiple dashboards run simultaneously? Which specific query is scanning the most GB? This transforms a vague "it feels slow" complaint into a specific optimization target.

**Specific features:**
- SQL Warehouse → Cache Hit Rate trend (has caching degraded after a schema change?)
- SQL Warehouse → Queue Depth (is the warehouse undersized for concurrent users?)
- SQL Warehouse → Top Queries by GB Scanned (find the specific query killing performance)
- Query Intelligence → Repeat Queries (which queries run 50+ times/day and should be materialized as a table?)

---

### 👤 Persona 20 — The ML Ops Engineer (Post-Deployment)
**Their question:** *"My model serving endpoint is generating significant cost. Is traffic volume or inefficient inference driving it?"*

Once an ML model is live in production, inference costs accumulate steadily. The **Model Serving Dashboard** tracks endpoint spend over time — letting MLOps engineers see whether rising costs correlate with rising traffic (acceptable) or with inefficient batch sizing, cold starts, or overprovisioned endpoint resources (fixable).

**Specific features:**
- Model Serving Dashboard → Endpoint spend by model
- ClusterDNA (for batch inference job logs — detect memory pressure or serialization overhead)

---

### 👤 Persona 21 — The CTO / VP of Engineering / Executive Sponsor
**Their question:** *"Give me the one number I need to know about our Databricks investment."*

Executives don't use dashboards daily — but they need a monthly briefing. FinOps Copilot's **FinOps Health Score (0–100)** was designed exactly for this. A single number, color-coded, with four component drivers. Paired with the 3-month forecast, an executive can answer in 30 seconds: "Are we on track? Are we healthy? Are we going to blow the budget?"

**Specific features:**
- FinOps Health Score (the exec summary metric)
- 3-Month AI Forecast on the Home Page (trend vs. budget)
- Anomaly count (how many cost spikes occurred this month)

> 💡 **Creative use case:** The FinOps Health Score becomes a standing agenda item in the monthly engineering leadership review — just like uptime SLAs or sprint velocity. It makes cost governance feel as natural as operational reliability.

---

### 👤 Persona 22 — The FinOps Community of Practice Lead
**Their question:** *"How do we make the entire organization better at Databricks cost management?"*

CoP leads use FinOps Copilot as a **teaching tool**. In monthly FinOps guild meetings, they screen-share the Command Centre and walk through real organizational data: "Here's a team that reduced their failed-run waste by 60% after fixing retry logic — here's what that looked like in the dashboard." The Notebook Intelligence Panel becomes a **live training guide** — every 📡 button is a teachable moment connecting a cost metric to a specific optimization technique with runnable code.

**Specific features:**
- All dashboards (organizational teaching material)
- Notebook Intelligence Panel (link directly to runnable optimization demos)
- ClusterDNA (live demo of before/after optimization)

---

## 🧩 Creative / Out-of-the-Box Personas

### 👤 Persona 23 — The Vendor / ISV Partner Doing a PoC on Your Databricks
**Their question:** *"Is our software efficient on your Databricks environment?"*

When a vendor runs a proof-of-concept on your Databricks tenant, they consume your DBUs. FinOps Copilot lets the platform team create a **tagged cluster group** for the PoC, then run Cost Lookup by Tag to get a per-vendor cost statement. At the end of the PoC, you hand the vendor a cost report: "Your PoC consumed $X in 2 weeks." This makes PoC governance commercially transparent.

---

### 👤 Persona 24 — The New Employee / Onboarding Data Engineer
**Their question:** *"How does our organization use Databricks? What does a 'normal' week look like?"*

The first week at a new company is disorienting. FinOps Copilot gives a new hire an instant **organizational map of the Databricks estate** — which teams exist (Chargeback), what types of workloads run (Interactive vs. Jobs vs. SQL), how much things typically cost, and what the optimization culture looks like (FinOps Health Score). It turns onboarding from "read the wiki" to "explore the live data."

---

### 👤 Persona 25 — The Internal Audit Team
**Their question:** *"Is Databricks spend being managed responsibly, and is there accountability for every resource?"*

Internal auditors review cloud spend governance annually. FinOps Copilot generates the evidence trail:
- What % of clusters have owner tags? (accountability)
- Are VACUUM jobs running on all tables? (storage governance)
- Are there anomalous cost spikes that weren't investigated? (cost control)
- Who spent what, on which team? (chargeback accuracy)

The entire **Chargeback + Storage Health + Anomaly Detection** combination becomes an audit readiness package.

---

### 👤 Persona 26 — The Platform Capacity Planner (Quarterly Planning)
**Their question:** *"We're growing 40% next quarter. What does that mean for our Databricks budget?"*

Every quarter, finance needs the next quarter's cloud budget. The **6-month AI forecast** combined with the historical trend gives the capacity planner a defensible projection. Instead of saying "we'll need about 40% more," they can say "based on our current consumption pattern and growth trajectory, the model projects $X spend for Q3 within a ±12% confidence band."

---

## 📊 Summary Matrix: Persona × Phase

| # | Persona / Role | Ph 1 · Pre-Onboard | Ph 2 · Development | Ph 3 · QA & Testing | Ph 4 · Pre-Launch | Ph 5 · Production Live |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | ☁️ Cloud / Solutions Architect | ✅ | — | — | ✅ | — |
| 2 | 💰 IT Finance Manager / FinOps Analyst | ✅ | — | — | — | ✅ |
| 3 | 🤝 Procurement / Vendor Manager | ✅ | — | — | — | ✅ |
| 4 | 🏛️ Data Platform / CoE Lead | ✅ | — | — | ✅ | ✅ |
| 5 | 🛠️ Data Engineer | — | ✅ | — | — | — |
| 6 | 🤖 ML Engineer / Data Scientist | — | ✅ | — | — | ✅ |
| 7 | 🔀 DLT Pipeline Engineer | — | ✅ | ✅ | — | — |
| 8 | 📊 Analytics Engineer / dbt Developer | — | ✅ | — | — | ✅ |
| 9 | 🧪 QA Engineer / Performance Tester | — | — | ✅ | — | — |
| 10 | 🔍 Data Quality / Governance Analyst | — | — | ✅ | ✅ | ✅ |
| 11 | ⚙️ DevOps / CI/CD Engineer | — | — | ✅ | ✅ | — |
| 12 | 🔧 Platform Engineer / SRE | — | — | — | ✅ | ✅ |
| 13 | 📈 Cloud FinOps Manager / VP Engineering | — | — | — | ✅ | ✅ |
| 14 | 🔒 Security & Compliance Officer | — | — | — | ✅ | ✅ |
| 15 | 🏗️ Databricks Solution Architect | ✅ | ✅ | — | ✅ | — |
| 16 | 📋 FinOps / Cloud Cost Analyst (Day-to-Day) | — | — | — | — | ✅ |
| 17 | 👥 Team Lead / Engineering Manager | — | ✅ | — | — | ✅ |
| 18 | 🚨 On-Call SRE / Incident Responder | — | — | — | — | ✅ |
| 19 | 🗄️ SQL Analyst / BI Developer | — | — | ✅ | — | ✅ |
| 20 | 🤖 MLOps Engineer (Post-Deployment) | — | ✅ | — | — | ✅ |
| 21 | 🎯 CTO / VP of Engineering / Executive Sponsor | ✅ | — | — | — | ✅ |
| 22 | 🌐 FinOps Community of Practice Lead | — | — | — | — | ✅ |
| 23 | 🏢 Vendor / ISV Partner (PoC) | — | ✅ | ✅ | — | — |
| 24 | 🆕 New Employee / Onboarding Engineer | — | ✅ | — | — | — |
| 25 | 🔎 Internal Audit Team | — | — | — | ✅ | ✅ |
| 26 | 📅 Platform Capacity Planner | ✅ | — | — | ✅ | ✅ |
| | **Phase Coverage (active personas)** | **6** | **8** | **6** | **9** | **15** |

> **Legend:** ✅ = Primary use phase for this persona &nbsp;·&nbsp; — = Not a primary phase

---

*Total: **26 distinct personas** across **5 lifecycle phases** — every one of them served by features already built into FinOps Copilot.*
