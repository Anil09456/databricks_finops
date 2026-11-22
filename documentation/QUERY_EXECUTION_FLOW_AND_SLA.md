# FinOps Copilot (React App) — Query Execution Flow and SLA Architecture

This document provides a clear, high-level summary designed for both management presentations and technical review. It explains how queries execute under the hood, how the caching system works, and the real-world Service Level Agreements (SLAs) for data refreshes.

---

## 📋 Executive Summary for Management (The "Simple Terms" Version)

To explain this architecture to stakeholders and leadership, you can summarize it in **three core concepts**:

1. **The Engine (FastAPI Backend)**: A high-performance middle layer between the user's browser and Databricks. It handles queries, processes data, and serves the user interface.
2. **The Shield (In-Memory Cache)**: To keep page load times **under 50 milliseconds** and prevent overloading your Databricks SQL Warehouse, the backend stores query results in-memory.
3. **The Pool (Concurrent Connections)**: Unlike standard single-connection setups which serialize query executions, the backend implements a **connection pool**. This allows multiple database queries to run **simultaneously (concurrently)**, drastically shortening data load times.

### 🔄 Scenario-by-Scenario Execution Flow

#### Scenario 1: Starting the Backend Server
* **What happens**: The FastAPI server starts up and immediately spawns a background thread to pre-warm the system. 
* **Database impact**: The background thread checks out connections from the pool and runs all 60+ dashboard queries concurrently in parallel batches.
* **User experience**: The server binds to its port immediately. The user can open the app right away without waiting.
* **Duration**: Warmed in the background over **~7.8 minutes** without blocking the user.

#### Scenario 2: User Lands on the Home Page
* **What happens**: The browser requests settings and retrieves the workspace cost trend.
* **Database impact**: **Zero**. The backend fetches the cost trend directly from the warm cache in memory.
* **User experience**: The page loads and displays charts **instantly (<10 milliseconds)**.

#### Scenario 3: User Navigates to the Command Centre (9 Tabs)
* **What happens**: React mounts all 9 dashboards (Overall, Interactive, Jobs, etc.) in the DOM at the same time to allow fast tab-switching. The browser fires a burst of **50+ concurrent requests** to the backend.
* **Database impact**: **Zero**. The backend interceptor routes all 50+ requests to the cache.
* **User experience**: All tabs load and render their KPIs, charts, and tables **concurrently in under 50 milliseconds**.

#### Scenario 4: User Clicks "Refresh All Data" (Left Sidebar Button)
* **What happens**: Clicking this clears the entire cache. The backend is forced to run all 60+ queries on Databricks from scratch.
* **Database impact**: High. The backend executes all 60+ queries in parallel batches using the connection pool of 8 connections.
* **User experience**: The browser displays a loading indicator while the backend processes. Once finished, the frontend displays the *"Dashboards are refreshed!"* toast notification and reloads the page.
* **Duration**: **7.8 minutes (468.5s)** (measured).

#### Scenario 5: User Clicks "Refresh" on a Specific Tab / Section
* **What happens**: Only the cache keys for that specific tab are wiped. The browser requests only the queries belonging to that tab.
* **Database impact**: Low. The requested queries execute concurrently in a single batch using the connection pool.
* **User experience**: A loading spinner is shown on that tab while the queries run. Once completed, the tab refreshes, showing the toast notification.
* **Duration**: **1.3 - 2.6 minutes** depending on the tab (e.g. **2.6 minutes (153.1s)** for the Overall Tab and **1.4 minutes (82.4s)** for the Jobs Tab).

---

## ⏱️ SLA Comparison Table (Sequential vs. Parallel Pool)

Because the Databricks SQL Warehouse is **Serverless**, it boots near-instantly (**2 - 5 seconds**). The table below outlines the comparative SLA durations between the past sequential gatekeeper approach and the current connection-pool parallel architecture (actual measured results where indicated, else estimated):

| User Action / Dashboard Section | SQL Query Count | Past Sequential SLA (Original Lock) | New Parallel SLA (Connection Pool of 8) | Status / Notes |
|---|:---:|:---:|:---:|---|
| **Refresh All Data** (Sidebar Button) | **60+ queries** | ~15 - 25 minutes | **7.8 minutes (468.5s)** | **Actual Measured** (Full cache reload) |
| **Home Page Loader** (Initial Mount) | **1 query** | 1.5 - 2.5 minutes | **1.5 - 2.5 minutes** | Active database execution |
| **Overall Tab Refresh** | **9 queries** | ~10 minutes (605s) | **2.6 minutes (153.1s)** | **Actual Measured** |
| **Interactive Computes Tab** | **7 queries** | ~3 - 4 minutes | **1.4 minutes (84.4s)** | **Actual Measured** |
| **Jobs Cost Tab** | **8 queries** | ~6 minutes (361s) | **1.4 minutes (82.4s)** | **Actual Measured** |
| **SQL Warehouse Tab** | **10 queries** | ~4 - 5 minutes | **1.4 minutes (86.3s)** | **Actual Measured** |
| **DLT Pipelines Tab** | **11 queries** | ~6 - 8 minutes | **1.6 minutes (97.6s)** | **Actual Measured** |
| **Query Intelligence Tab** | **6 queries** | 45 - 60 seconds | **16.1 seconds** | **Actual Measured** |
| **Merge & Clustering Tab** | **5 queries** | ~2 - 3 minutes | **1.4 minutes (81.5s)** | **Actual Measured** |
| **Storage Health Tab** | **7 queries** | ~2 - 3 minutes | **1.4 minutes (82.0s)** | **Actual Measured** |
| **Tagging & Chargeback Tab** | **3 queries** | ~1.5 - 2 minutes | **1.3 minutes (78.1s)** | **Actual Measured** |

---

## ⚙️ Active Configuration & Connection Pool Scaling

The current parallel SLAs are measured against your configured warehouse and application settings:
* **Type**: Serverless
* **Cluster Size**: 2X-Small
* **Auto Stop**: After 10 minutes of inactivity
* **Scaling**: Cluster count: Active 1, Min 1, Max 2 (Allows processing the parallel batch capacity)
* **Application Pool size**: `DATABRICKS_POOL_SIZE = 8`

### 📈 Scaling Interactions & SLA Optimization

#### 1. Pool Concurrency + Horizontal Auto-Scaling (`Min 1, Max 2` Warehouse)
* **Mechanism**: Spawning 8 parallel queries triggers Databricks SQL queue scheduler. The warehouse detects the concurrency burst and spins up a second 2X-Small cluster replica within seconds to balance the load.
* **Impact**: Total query execution time drops by **70% - 80%**. The entire query workload is processed in parallel with dedicated CPU/memory nodes.
* **DBU Cost**: burn rate doubles during the short burst when both clusters are active. However, because execution completes 4x faster and the clusters auto-stop after 10 minutes of inactivity, overall DBU usage remains equivalent.

#### 2. Pool Concurrency + Static Scaling (`Min 1, Max 1` Warehouse)
* **Mechanism**: Spawning 8 parallel queries puts them in the Databricks queue. The single cluster uses internal multi-threading and query scheduling to execute them concurrently on the same hardware.
* **Impact**: Faster execution than sequential lock (approx. **50% reduction**), but constrained by the single-cluster resource cap.
* **DBU Cost**: Zero increase in DBU rate; remains fixed at 1 cluster.

#### 3. Vertical Scaling (Increasing Cluster Size to X-Small/Small)
* If the workload grows, upgrading the cluster size vertically (from 2X-Small to X-Small or Small) will speed up list-prices range joins on system tables. Combining a connection pool with an **X-Small** size can bring tab load times down under **60 seconds**.

---

## 💡 Implemented Architecture: Connection Pool & Parallel Execution

To eliminate the sequential locking bottleneck, the backend connection management layer has been refactored in [db.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_with_python_fast_api/data/db.py):

1. **`DatabricksConnectionPool` Singleton**: We replaced the single-connection singleton (`_conn`) with a thread-safe `queue.Queue`-based connection pool (`_pool`) configured to maintain up to `DATABRICKS_POOL_SIZE = 8` concurrent connections.
2. **Eviction of the Sequential Lock**: Removed `_query_lock` entirely. Query threads inside `ThreadPoolExecutor` now check out an active connection from the pool, execute their SQL query concurrently, and return the connection in a `finally` block.
3. **Self-Healing Connection Recycles**: Verified connections are open using `conn.open` upon checkout. If a checked-out connection fails due to a network reset, TLS handshake block, or session timeout, the connection is closed, discarded, and replaced with a fresh connection on subsequent checkouts.

### 🚀 Optimized Data Fetching: Apache Arrow Integration
Instead of standard row-by-row fetching (`fetchall()`), our database runner uses `cur.fetchall_arrow().to_pandas()`.
* **Columnar Transfer**: Rather than parsing individual PyObjects for every row and cell, the connector fetches data in Apache Arrow columnar format.
* **Speedup**: This yields a **3x to 10x faster execution speed** for pulling datasets into the FastAPI backend.

### 🌐 Alternative APIs & Future Performance Options
If even higher throughput or faster execution is required in the future, Databricks provides another query execution API:

#### 1. Databricks SQL Statements API (REST API)
* **What it is**: An HTTP REST API endpoint (`POST /api/2.0/sql/statements/`) to execute SQL statements.
* **Why it can be faster**:
  * **Asynchronous Execution**: The backend can submit queries asynchronously via HTTP and poll for completion without holding open stateful, long-lived TCP/Thrift sockets.
  * **Cloud Fetch Integration**: It natively supports Cloud Fetch. For large result sets, the warehouse dumps the data directly to cloud storage (S3/ADLS/GCS) in parallel Arrow/Parquet chunks. The client downloads these chunks concurrently from pre-signed URLs, bypassing the single database connection bandwidth bottleneck.
* **Trade-offs**: Requires building custom HTTP polling, schema conversion, and chunk assembly logic in Python. For smaller datasets, the REST polling latency overhead makes it slower than reusing a warm connection pool connection.

#### 2. Recommendation for Current Setup
For our current application requirements, the **Connection Pool + Apache Arrow** method is the most optimal approach:
* It keeps connections warm, avoiding TCP handshakes and OAuth session setup overheads.
* It leverages Apache Arrow for fast data serialization.
* It processes queries concurrently up to our pool limit (8), aligning perfectly with the warehouse's concurrent scheduling capacity.

---


## 5. Technical Parallel Flow Diagram

The sequence diagram below details the concurrent connection handshakes between the User Browser, React Frontend, FastAPI Backend, Memory Cache, and Databricks SQL Warehouse:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant FE as React Frontend
    participant BE as FastAPI Backend
    participant Cache as Memory Cache
    participant DB as Databricks SQL

    Note over BE,DB: Scenario 1: Startup & Parallel Cache Pre-Warming
    BE->>BE: Startup Lifespan Hook
    BE->>+BE_Thread: Spawn daemon thread (pre_warm)
    BE_Thread->>BE_Thread: refresh_all_caches()
    par Parallel query submissions [max_workers=8]
        BE_Thread->>DB: Checkout Pool Conn 1 & Run Query Group 1
        BE_Thread->>DB: Checkout Pool Conn 2 & Run Query Group 2
        ...
        BE_Thread->>DB: Checkout Pool Conn 8 & Run Query Group 8
    end
    DB-->>BE_Thread: Return results concurrently (took ~20-30s per query or ~45-120s max)
    BE_Thread->>Cache: Populate Cache Store
    deactivate BE_Thread

    Note over FE,BE: Scenario 2: Home Page Load
    User->>FE: Open FinOps Command Center
    FE->>BE: GET /api/settings
    BE-->>FE: Return Notebook settings & theme
    FE->>BE: GET /api/overall/workspace-cost
    BE->>Cache: Look up "overall:workspace_cost"
    alt Cache Hit (Pre-warmed)
        Cache-->>BE: Return cached DataFrame
        BE-->>FE: Return JSON (instant, <10ms)
    else Cache Miss
        BE->>DB: Run Workspace Cost Query
        DB-->>BE: Return DataFrame
        BE->>Cache: Save in Cache Store
        BE-->>FE: Return JSON (1.5 - 2.5 min)
    end

    Note over FE,BE: Scenario 3: Navigate to Command Centre (9 Tabs Mount)
    FE->>FE: Render CommandCentre.jsx (all tabs mount in DOM)
    par Tab Requests fired concurrently
        FE->>BE: Overall Tab APIs (6 requests)
        FE->>BE: Interactive Tab APIs (6 requests)
        FE->>BE: Jobs Tab APIs (8 requests)
        FE->>BE: SQL Warehouse Tab APIs (9 requests)
        FE->>BE: Storage, DLT, Tagging, QI, Merge APIs
    end
    BE->>Cache: Check cached entries for all keys
    Cache-->>BE: Return cached values
    BE-->>FE: Return all tab metrics concurrently (<50ms total)

    Note over FE,DB: Scenario 4: "Refresh All Data" Clicked
    FE->>BE: POST /api/cache/refresh
    BE->>Cache: clear_all()
    BE->>+BE_Thread: Loop through all_fns & execute in ThreadPoolExecutor (max_workers=8)
    par Concurrent Execution via Connection Pool
        BE_Thread->>DB: Checkout Pool Conn 1 & Run Query 1
        BE_Thread->>DB: Checkout Pool Conn 2 & Run Query 2
        ...
        BE_Thread->>DB: Checkout Pool Conn 8 & Run Query 8
    end
    DB-->>BE_Thread: Return results in concurrent batches
    BE_Thread->>Cache: Cache key-value pairs
    deactivate BE_Thread
    BE-->>FE: HTTP 200 {"status": "refreshed"}
    FE->>FE: Reload window & remount components
    FE->>BE: Re-fetch all tab APIs
    BE->>Cache: Hit Cache (Instant)
    BE-->>FE: Render UI immediately
```
