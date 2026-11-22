# 📊 Cloud Cost Calculator — Data Architecture & Excel Integration Guide

> **Audience:** Developers, FinOps practitioners, platform engineers, and stakeholders maintaining or extending the FinOps CoPilot Cloud Cost Calculator.
>
> This document explains the data architecture behind the **Cloud Cost Calculator**, details how the original Excel/CSV rate cards were migrated to client-side structures, analyzes why embedded JS/JSON is the recommended production design, and outlines how Excel reports are dynamically generated and exported.

---

## 1. Overview & Purpose of the Cost Calculator

The **Cloud Cost Calculator** (located at `frontend/src/pages/CostCalculator.jsx`) provides pre-deployment, proactive financial planning and capacity modeling for Databricks cloud infrastructure. It allows engineering leads, architects, and FinOps analysts to estimate costs **before provisioning or scheduling workloads**.

The calculator provides modeling across four distinct compute and storage pillars:
1. **Databricks & Compute**: Production job tiers (Bronze, Silver, Gold, Platinum) with custom runtime, monthly frequency, worker count, and VM instance types.
2. **AWS S3 Storage**: Direct capacity modeling by data tier with monthly growth projection, alongside an empirical schema-based estimator (records, columns, average column length).
3. **SQL Warehouses**: Sizing (2X-Small to 4X-Large), type (SQL Compute vs. SQL Pro Compute), operating hours, and concurrent cluster cluster counts.
4. **Development Compute**: Interactive developer cluster overhead (driver instance, worker nodes, operating months, and hours per month).

---

## 2. Historical Context: The Original Prototype Spreadsheets

In the initial Streamlit proof-of-concept (PoC), pricing rates were sourced from three separate spreadsheets/flat files:

| Original Prototype File | Purpose in Streamlit PoC | Original Limitations |
|---|---|---|
| `S3_Storage_cost.xlsx` | S3 tiered rate lookup across storage classes (`Standard`, `Glacier`, `One Zone`, etc.) for ≤50 TB, ≤500 TB, and >500 TB bands. | Required server-side openpyxl parsing; slow file I/O on every rerun. |
| `SQL_warehouse - Sheet1.csv` | Lookups for SQL Warehouse sizing, worker counts, DBU rates per hour, and on-demand EC2 rates. | Static file pathing dependent on operating system environment. |
| `final_out.csv` | Complete instance rate card mapping AWS EC2 VM types to Databricks Unit (DBU) factors and hourly VM costs. | Heavy CSV read operations and memory overhead on backend boot. |

---

## 3. Current Implementation: Where the Data Lives Now

In the modern **React + FastAPI** architecture, the pricing data was decoupled from disk files and migrated directly into clean, optimized JavaScript and JSON modules:

```
react_with_python_fast_api/frontend/src/pages/costCalculator/
├── costCalculatorData.js        ← S3 tiered pricing, SQL warehouse rates & helper configs
├── rate_card_raw.json           ← Complete compute instance and worker rate card
├── calculations.js              ← Pure calculation formulas and enrichment logic
├── exportToExcel.js             ← Client-side dynamic Excel workbook generator (SheetJS)
├── CostCalculator.jsx           ← Main container component and state orchestrator
├── DatabricksTab.jsx            ← Production jobs tier modeling tab
├── S3Tab.jsx                    ← S3 storage modeling tab
├── SQLWarehouseTab.jsx          ← SQL Warehouse sizing and scheduling tab
├── DevelopmentTab.jsx           ← Developer interactive cluster modeling tab
├── CostSummaryPanel.jsx         ← Donut chart breakdown and monthly/yearly totals
└── CalculationExplanationTab.jsx← Transparent formula reference for all 4 pillars
```

### A. `costCalculatorData.js`
* **Relative Path:** `frontend/src/pages/costCalculator/costCalculatorData.js`
* **Contents:**
  * `S3_PRICING`: S3 tiered storage class pricing per GB (≤50TB, ≤500TB, >500TB) for Standard, Intelligent-Tiering, Standard-IA, Express One Zone, Glacier Instant Retrieval, Glacier Flexible Retrieval, Glacier Deep Archive, and One Zone-IA.
  * `SQL_RAW_RATES`: Sizing matrix for **SQL Compute** and **SQL Pro Compute** (2X-Small through 4X-Large), worker node counts, DBU/hr rates, and on-demand Linux host costs.
  * `SQL_WORKER_COUNTS`: Worker node mapping per warehouse size.
  * `TIERS`: Production job tier classifications (Bronze, Silver, Gold, Platinum).

### B. `rate_card_raw.json`
* **Relative Path:** `frontend/src/pages/costCalculator/rate_card_raw.json`
* **Contents:**
  * Full flattened rate card containing all AWS EC2 instance families supported on Databricks (e.g., `m5.xlarge`, `c5.2xlarge`, `r5.4xlarge`, `i3.xlarge`).
  * Maps each instance to its DBU factor, memory (GB), vCPU count, and hourly on-demand cloud infrastructure rate.

---

## 4. Architectural Analysis: Why JS/JSON is Superior to Runtime Excel Files

A common question when migrating from prototypes is: *"Can we still keep reading an `.xlsx` file on disk, or is having the data in JS/JSON better?"*

**Having the data embedded in JS/JSON is significantly superior for production web applications.** Here is the technical comparison:

| Metric / Dimension | Embedded JS / JSON (Current) | Server-Side Excel File Reading (Legacy) |
|---|---|---|
| **Latency / Response Time** | **0 milliseconds (Instant)**. Calculations execute directly in the browser's V8 engine as the user types or adjusts sliders. | **150ms – 1,200ms per adjustment**. Requires sending an HTTP request to FastAPI, opening the file, parsing XML sheets, and serializing JSON back. |
| **Server Load & Scalability** | **Zero server load**. Computation is 100% offloaded to client browsers. Supports unlimited concurrent users with 0 backend CPU. | **High server bottleneck**. Multi-user concurrency locks file handles; server memory spikes from parsing large Excel sheets. |
| **Operating System Portability** | **100% portable**. Works identically across Windows, macOS, Linux, Docker containers, and Databricks Apps runtime. | **Fragile**. File path separators (`\` vs `/`), permissions (`EACCES`), and missing relative file paths frequently cause crashes in Linux containers. |
| **File Corruption Risk** | **Zero**. Data is bundled into compiled static assets during `npm run build`. Cannot be accidentally locked, deleted, or corrupted. | **High**. Opening the `.xlsx` file in Microsoft Excel or OneDrive while the server is running locks the file handle and throws `PermissionDenied` errors. |
| **Version Control & Auditing** | **Full Git integration**. Every pricing change is tracked as a clean, reviewable line diff in Git pull requests. | **Binary blob**. Git cannot diff binary `.xlsx` files; changes cannot be code-reviewed or easily rolled back. |
| **Offline / Resiliency** | **Works offline**. Once loaded, the cost calculator functions with zero network connectivity. | **Fails offline**. Requires active network connection to the backend server. |

---

## 5. Dynamic Excel Export: How Excel is Generated in the App

While we do not use static Excel files as an *input*, the application **fully supports Excel as an output**.

When the user finishes estimating costs and clicks the **"Export Excel"** button in the Cost Calculator header:
1. `exportToExcel.js` invokes **SheetJS (`xlsx`)** client-side.
2. It builds a multi-sheet workbook in browser memory containing 5 formatted tabs:
   * **Sheet 1: `Summary`** — High-level cost distribution by category (Monthly, Quarterly, Half-Yearly, Yearly) with total aggregate spend.
   * **Sheet 2: `Databricks & Compute`** — Granular breakdown of every job tier (Job name, Runtime hours, Monthly runs, Compute type, Instance, Nodes, DBU cost, DBX cost, EC2 cost).
   * **Sheet 3: `S3 Storage`** — Storage class, data volumes, growth rates, and projected yearly tiered costs.
   * **Sheet 4: `SQL Warehouse`** — Warehouse name, size, worker count, operating hours/day, days/month, and DBU/EC2 costs.
   * **Sheet 5: `Development Cost`** — Interactive developer compute overhead (driver type, worker type, nodes, hours/month, and total cost).
3. It triggers an instant browser download of **`cloud_cost_report.xlsx`** with preset column widths (`!cols`) and rounded numerical currency formatting.

---

## 6. Maintenance Guide: How to Update Rates in the Future

If Databricks or AWS updates pricing, or if your organization negotiates custom enterprise discount rates, update the files as follows:

### Scenario A: Updating S3 Storage Class Rates
1. Open `frontend/src/pages/costCalculator/costCalculatorData.js`.
2. Locate the `S3_PRICING` object (lines 8–17).
3. Update the `rate50TB`, `rate500TB`, or `rateOver500TB` values for the target tier.
4. Save the file. (In local dev, Vite hot-reloads immediately; for production, run `npm run build`).

### Scenario B: Updating SQL Warehouse Rates
1. Open `frontend/src/pages/costCalculator/costCalculatorData.js`.
2. Locate the `SQL_RAW_RATES` array (lines 21–40).
3. Update `dbuPerHour`, `ratePerHour`, or `onDemandLinuxHr` for the corresponding instance size.

### Scenario C: Updating VM Instance Pricing (Rate Card)
1. Open `frontend/src/pages/costCalculator/rate_card_raw.json`.
2. Search for the instance type (e.g., `"m5.xlarge"`).
3. Update the corresponding `ratePerHour` or `dbuFactor`.
4. *Tip:* If you have an updated CSV export, you can convert the CSV to JSON via a simple Python snippet:
   ```python
   import pandas as pd
   df = pd.read_csv("updated_rate_card.csv")
   df.to_json("rate_card_raw.json", orient="records", indent=2)
   ```

---

## 7. Mathematical Formulas Reference

For complete transparency, all calculations implemented in `calculations.js` adhere to official Databricks and AWS Enterprise Plan formulas:

### 1. Databricks & Compute Jobs
$$\text{Nodes Total} = \text{Worker Nodes} + 1 \quad (\text{Includes 1 Driver Node})$$
$$\text{DBU Cost} = \text{DBU Rate} \times \text{Nodes Total} \times \text{Runtime (hrs)} \times \text{Runs/Month}$$
$$\text{EC2 Cost} = \text{On-Demand VM Rate} \times \text{Nodes Total} \times \text{Runtime (hrs)} \times \text{Runs/Month}$$
$$\text{Total Job Cost} = \text{DBU Cost} + \text{EC2 Cost}$$

### 2. S3 Storage
* **Direct Storage:**
  $$\text{Monthly Cost} = \text{Storage Volume (GB)} \times \text{Tiered Rate per GB}$$
* **Monthly Growth Compounding:**
  $$\text{Yearly Total} = \text{Monthly Base} \times \frac{(1 + g)^{12} - 1}{g} \quad \text{where } g = \frac{\text{Growth \%}}{100}$$
* **Table-Based Estimation:**
  $$\text{Estimated Size (Bytes)} = \text{Records} \times \text{Columns} \times \text{Avg Col Length} \times \text{Bytes per Char (1)} \times \text{Compression Ratio (0.5)}$$
  $$\text{Estimated GB} = \frac{\text{Estimated Size (Bytes)}}{1024^3}$$

### 3. SQL Warehouses
$$\text{DBU Cost} = \text{DBU Rate/hr} \times \text{Nodes} \times \text{Hours/Day} \times \text{Days/Month}$$
$$\text{EC2 Cost} = (\text{Driver Rate} + \text{On-Demand Rate/hr} \times \text{Nodes}) \times \text{Hours/Day} \times \text{Days/Month}$$
$$\text{SQL Total} = \text{DBU Cost} + \text{EC2 Cost}$$

### 4. Development Interactive Compute
$$\text{DBX Cost} = (\text{Driver DBU Rate} + \text{Worker DBU Rate} \times \text{Nodes}) \times \text{Hours/Month} \times \text{Months}$$
$$\text{EC2 Cost} = (\text{Driver EC2 Rate} + \text{Worker EC2 Rate} \times \text{Nodes}) \times \text{Hours/Month} \times \text{Months}$$
$$\text{Dev Total} = \text{DBX Cost} + \text{EC2 Cost}$$
