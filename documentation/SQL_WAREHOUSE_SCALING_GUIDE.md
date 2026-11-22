# Databricks SQL Warehouse Scaling & Concurrency Guide

This guide explains how Databricks SQL Warehouses manage query execution, concurrency, and sizing (vertical vs. horizontal scaling), and provides recommendations for optimizing performance and cost for the FinOps CoPilot application.

---

## 1. Core Concepts: Sizing vs. Scaling

Databricks SQL (DBSQL) Warehouses use two independent dimensions to scale performance:

```
                  ┌─────────────────────────────────┐
                  │      VERTICAL SCALING           │
                  │      (Cluster Size)             │
                  │   XS ──> S ──> M ──> L ──> XL   │
                  │  Determines individual speed   │
                  └────────────────┬────────────────┘
                                   │
                                   ▼
                  ┌─────────────────────────────────┐
                  │     HORIZONTAL SCALING          │
                  │      (Cluster Count)            │
                  │      Min: 1  ◄───►  Max: 8      │
                  │   Determines total concurrency  │
                  └─────────────────────────────────┘
```

---

## 2. Horizontal Scaling: Handling Concurrency

Horizontal scaling increases the **number of clusters** running in parallel to handle multiple concurrent users or queries.

### The 10-Query Concurrency Target
* **Standard Rule:** Databricks allocates a baseline target of **10 concurrent queries per cluster** (regardless of the cluster size, from 2X-Small to 4X-Large).
* **The Queue:** If all active clusters are executing 10 queries and a new query arrives:
  1. It is placed in a **FIFO Queue** (up to a maximum queue limit of **1,000 queries**).
  2. If the queue exceeds 1,000, subsequent queries fail with an HTTP 429 (Too Many Requests) error.

### Intelligent Workload Management (IWM)
On **Serverless** and **Pro** SQL Warehouses, Databricks uses Intelligent Workload Management (IWM) to dynamically scale:
* When IWM detects queries entering the queue, it automatically spins up new clusters (up to your configured **Max Clusters** limit).
* Once the query spike subsides, IWM automatically terminates the extra clusters to save costs.

---

## 3. Vertical Scaling: Sizing individual clusters

Vertical scaling increases the **T-shirt size** of your cluster, adding more physical CPU cores, RAM, local SSD storage, and network bandwidth to the worker nodes.

| Size | Relative Compute Resources | Primary Use Case |
|---|---|---|
| **2X-Small** | Baseline (typically 1 node) | Small datasets, simple lookup queries, lightweight BI dashboards |
| **X-Small / Small** | 2x – 4x resources | Mid-sized tables, moderate dashboards |
| **Medium / Large** | 8x – 16x resources | Heavy ETL, complex SQL joins, large-scale data scans (GBs to TBs) |
| **XL to 4XL** | Extreme compute | Terabyte/Petabyte scale queries, high-performance enterprise BI |

### Does a larger size mean more concurrency?
**No.** Changing a cluster size from 2X-Small to Medium does not increase the target number of queries it runs at the same time (it is still 10). However, it speeds up query execution:
* A query that takes **1.5 seconds** on a 2X-Small might run in **0.1 seconds** on a Medium.
* Because each query finishes 15x faster, slots open up almost instantly, clearing the queue much quicker.

---

## 4. Cache-Warming Scenario in FinOps CoPilot

When the FinOps CoPilot application starts up (or when a cache refresh is triggered), it fires **60+ distinct SQL queries** in parallel to pre-warm the dashboard.

Here is how different warehouse setups handle this warming cycle:

### Setup A: Current Configuration (2X-Small, Min 1 / Max 1)
* **Active Slots:** 10 (1 cluster × 10 queries/cluster).
* **Execution Behavior:** 10 queries execute immediately. The other 50 sit in the queue and wait.
* **Warmup Time:** **~55 seconds** (due to sequential queue processing).
* **Cost:** Very low (only 1 cluster running).

### Setup B: Optimized Concurrency (2X-Small, Min 1 / Max 8)
* **Active Slots:** Dynamic up to 80 (8 clusters × 10 queries/cluster).
* **Execution Behavior:** Serverless quickly provisions additional 2X-Small clusters. All 60 queries run almost simultaneously.
* **Warmup Time:** **~5 to 10 seconds**.
* **Cost:** High efficiency. You only pay for the extra clusters for the few seconds they are warming up the cache, then they automatically spin down.

### Setup C: High Performance (Medium, Min 1 / Max 1)
* **Active Slots:** 10 (1 cluster × 10 queries/cluster).
* **Execution Behavior:** 10 queries run immediately. Because the nodes are large, the queries finish in milliseconds, letting the remaining 50 queries fly through the queue.
* **Warmup Time:** **~8 to 15 seconds**.
* **Cost:** Constant higher cost while the warehouse is active, but individual query performance is extremely fast.


## 5. Sizing & Configuration Best Practices

> [!TIP]
> **Recommended Configuration for FinOps CoPilot:**
> * **Type:** Serverless (wakes up in 2–5 seconds, avoiding the 5-minute Classic cold start).
> * **Cluster Size:** **2X-Small** or **X-Small** (sufficient for system tables).
> * **Autoscaling:** **Min 1, Max 4** (allows the warehouse to scale out during parallel dashboard requests and scale in when idle).
> * **Auto stop:** **10 minutes** of inactivity (minimizes idle cost).

### How to Monitor Concurrency in Databricks
To check if your SQL Warehouse is sized correctly:
1. In Databricks, navigate to **SQL Warehouses**.
2. Select your warehouse and open the **Monitoring** tab.
3. Review the **Running and Queued Queries** graph:
   * If you see **Queued Queries** peaking regularly, **increase your Max Clusters** limit (Scale Out).
   * If you see queries taking too long or throwing **Out of Memory / Spilling to Disk** warnings, **increase your Cluster Size** (Scale Up).
