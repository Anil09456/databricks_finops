# Application Caching & Resiliency Guide

This document describes the lifecycle, timing configurations, and detailed runtime behavior of the FinOps CoPilot caching system. It outlines how the application responds across different scenarios such as system startup, normal operation, laptop sleep, network disconnection, and recovery.

---

## 1. Caching Infrastructure Overview

The application utilizes a thread-safe, in-memory Time-To-Live (TTL) cache implemented in [react_fast_api/api/cache.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/cache.py). 

### Key Constants
* **Default Cache TTL:** `7200` seconds (**2 hours**), configurable via the `DATABRICKS_CACHE_TTL` environment variable in your `.env` file.
* **Auto-Reconnect Cooldown:** `10.0` seconds, preventing backend query spamming during connection drops.
* **Maximum Connection Retries:** `3` attempts with a maximum delay of `5.0` seconds (down from Databricks defaults to ensure fast failure-handling).
* **Extreme Cache Retention:** Expired cache entries are kept in memory for up to **7 days** to serve as fallback data before being pruned.

---

## 2. Scenario-by-Scenario Behavior

```
                        ┌──────────────────────────────┐
                        │      Client Request Received │
                        └──────────────┬───────────────┘
                                       │
                        ┌──────────────▼───────────────┐
                        │  Is Valid Cache Available?   │
                        └──────────────┬───────────────┘
                                       │
                      ┌────────────────┴────────────────┐
               Yes    │                            No   │
         ┌────────────▼──────────┐              ┌───────▼────────┐
         │ Serve Cache Instantly │              │ Query Database │
         │   (No DB Connection)  │              └───────┬────────┘
         └───────────────────────┘                      │
                                           ┌────────────┴────────────┐
                                    Success│                  Failure│
                                   ┌───────▼───────┐          ┌──────▼───────┐
                                   │ Update Cache  │          │ Expired Cache│
                                   │ & Serve Data  │          │  Available?  │
                                   └───────────────┘          └──────┬───────┘
                                                                     │
                                                        ┌────────────┴────────────┐
                                                 Yes    │                      No │
                                           ┌────────────▼──────────┐      ┌────▼────┐
                                           │ Serve Stale Fallback  │      │ Return  │
                                           │  (Log DB Warning)     │      │ 500 Err │
                                           └───────────────────────┘      └─────────┘
```

### Scenario 1: Cold Start / Initial Boot (App Startup)
* **Status:** Cache is completely empty (`_store` is `{}`).
* **App Behavior:**
  1. The FastAPI application boots up and initializes the Databricks connection.
  2. A daemon background thread triggers `refresh_all_caches()`.
  3. All 60+ metrics queries run in parallel (grouped across 8 threads) to populate the cache.
* **User Experience:** If a user opens the dashboard immediately at startup, they may see a skeleton loader for a few seconds. Once the warm-up completes, all tabs load instantly.

### Scenario 2: Normal Operation (Cache Hit — Fresh Data)
* **Status:** Cache has valid data, and the age of the cache is **less than 2 hours**.
* **App Behavior:** 
  1. The API route receives a request for a dashboard section (e.g., `/api/overall/kpi`).
  2. `cache.get()` detects a valid, unexpired entry and returns it immediately.
  3. **No database query is sent to Databricks.**
* **User Experience:** Instantaneous page loads (milliseconds) and zero resource consumption on your Databricks SQL Warehouse.

### Scenario 3: Cache Expiry — Normal Operation (Online)
* **Status:** Cache has expired (older than 2 hours), and the laptop has a stable internet connection.
* **App Behavior:**
  1. `cache.get()` returns `None` because the entry is expired.
  2. The router executes the query function `fn()`.
  3. The Databricks connection executes the SQL query successfully and returns a fresh DataFrame.
  4. `cache.set()` updates the cache with the new data and resets the 2-hour TTL timer.
* **User Experience:** The page loads in a few seconds (duration of the live Databricks query), and the dashboard updates with the latest metrics.

### Scenario 4: Laptop Sleep / Offline (Cache Hit — Fresh Data)
* **Status:** The laptop is put to sleep or disconnected from Wi-Fi. The cache contains data that is **less than 2 hours old**.
* **App Behavior:**
  1. Even though the physical network card is off and the Databricks connection is dead, the API endpoints query the in-memory cache.
  2. `cache.get()` retrieves the fresh memory structures.
* **User Experience:** You can wake up the laptop and click around the dashboard. All tabs load and display data instantly, even with no internet connection.

### Scenario 5: Laptop Sleep / Offline (Cache Miss — Broken Connection)
* **Status:** The laptop is offline or waking up from sleep, and the cache has expired (older than 2 hours).
* **App Behavior:**
  1. The app detects that the cache has expired and attempts to query Databricks.
  2. Because the connection is dead, the query fails.
  3. Our fast-fail policy stops retrying within **5 seconds** (preventing the background threads from hanging).
  4. The query error resets the singleton connection `_conn` to `None`.
  5. The caching helper `cached()` catches the query exception and calls `get(key, allow_expired=True)`.
  6. The expired data from the cache is retrieved and served to the user, alongside a console warning.
* **User Experience:** The page loads in about 5 seconds. You see the last known dashboard metrics instead of a blank screen or a loading skeleton that never resolves.

### Scenario 6: Network Reconnection & Recovery (Post-Sleep Self-Healing)
* **Status:** Your laptop has reconnected to the internet, and the app is currently serving stale fallback data.
* **App Behavior:**
  1. On the next dashboard click or scheduled cache-warming tick, the app attempts to execute the query.
  2. The connection manager checks the `_last_connect_time`. If more than **10 seconds** have passed since the last failure (the cooldown period), it initiates a new Databricks connection.
  3. The connection is successfully re-established, the queries run, and the cache is overwritten with fresh data.
* **User Experience:** The dashboard automatically updates with the latest, live Databricks data. No server restart is required.

### Scenario 7: Cost Lookup (On-Demand Search)
* **Status:** The user inputs a search term (e.g., searching for a specific job name or user email) on the **Cost Lookup** page.
* **App Behavior:**
  1. Cost lookup queries are **never cached** because they depend on dynamic, user-specified search parameters and timeframes.
  2. The backend sends the query directly to Databricks every time the "Search" button is clicked.
  3. If offline, the search fails immediately and displays an error message on the screen.
* **User Experience:** Real-time data lookup. Requires an active connection.

### Scenario 8: Run Intelligence (REST API Queries)
* **Status:** The user selects a Job Run or DLT Update to analyze.
* **App Behavior:**
  1. Run Intelligence bypasses the JDBC connector and directly executes live HTTP POST requests to the Databricks SQL Statements REST API (`/api/2.0/sql/statements`).
  2. These queries are **never cached** because they represent transient, run-specific telemetry.
  3. If the connection fails or the credentials expire, the API returns a clear error mapping the HTTP status code (e.g., 401 Unauthorized or 404 Not Found).
* **User Experience:** Live run analytics. Requires an active network connection.

---

## 3. Summary of Operational Parameters

| Metric / Parameter | Value | Location in Code |
|---|---|---|
| **Cache Lifetime (TTL)** | `7200 seconds` (2 Hours) | [config/settings.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/config/settings.py#L24) |
| **Offline Retries per Query** | `3 attempts` | [data/db.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/db.py#L47) |
| **Max Delay between Retries** | `5.0 seconds` | [data/db.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/db.py#L48) |
| **Reconnection Cooldown** | `10.0 seconds` | [data/db.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/data/db.py#L28) |
| **Stale Cache Pruning Age** | `7 days` | [api/cache.py](file:///c:/Users/dell/Downloads/FinOps_CoPilot_App_v1/react_fast_api/api/cache.py#L30) |
