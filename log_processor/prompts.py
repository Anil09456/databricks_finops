"""
log_processor/prompts.py
========================
Central prompt library for ALL AI engines in FinOps CoPilot.

  - CLUSTER_DNA_PROMPT   : Classic ClusterDNA log-file analyzer
  - RIE_SYSTEM_PROMPT    : Run Intelligence Engine (multi-source: system tables + events + logs)
  - RIE_SKILLS           : Shared analytical skills injected into the RIE prompt
"""

# ─────────────────────────────────────────────────────────────────────────────
# RUN INTELLIGENCE ENGINE — ANALYTICAL SKILLS (slim version)
# ─────────────────────────────────────────────────────────────────────────────

RIE_SKILLS = """
**1. Infrastructure Sizing**: Detect OOM (heap/container/GC), GC pressure, CPU saturation. Check if Photon is enabled for SQL/Delta workloads (recommend if not). For DLT, evaluate serverless fit vs classic autoscale based on utilization.

**2. Cost Optimization**: Analyze `total_cost_usd` and `total_dbus`. If retries=0, no executor loss, and duration > 10m, aggressively recommend Spot instances (60-80% worker cost reduction). If cluster is over-provisioned (low CPU/Memory utilization), recommend downsizing worker types.

**3. Spark Configuration**: 
  - Spill to Disk / Memory -> tune `spark.sql.shuffle.partitions`, recommend enabling AQE (`spark.sql.adaptive.enabled=true`).
  - Container OOM -> fix executor memory, tune `spark.memory.fraction`.
  - Streaming -> check `trigger` interval and `maxFilesPerTrigger` to stabilize micro-batches.

**4. Transformation & Query**: Detect CartesianProduct, BroadcastNestedLoopJoin, or massive shuffle stages. Suggest broadcasting small tables. For DLT: high `backlog_bytes` means the cluster is falling behind -> upsize cluster or switch from continuous to triggered mode.

**5. Data Quality**: Analyze DLT expectation pass/fail rates. Identify highest `failure_pct`. Recommend quarantine tables (Dead Letter Queues) or `ON VIOLATION DROP` for strict pipelines.

**6. Reliability & Retries**: Count retries from task breakdown. Cross-reference `scaling_events` to see if Spot preemption is causing delays. If executor loss is high -> recommend `spark.task.maxFailures` tuning or falling back to On-Demand instances.

### CRITICAL RULES FOR AI:
- **Prioritize User Context**: If the user's 'Optimization Priority' is 'Speed', favor larger clusters/Photon. If 'Cost', favor Spot/downsizing.
- **No Hallucinations**: NEVER invent data. If you do not see a specific signal in the JSON payload, DO NOT generate a recommendation for it.
- **Actionable Config**: Always provide the exact Spark config, SQL, or JSON snippet in `code_or_config`.
- **Quantify Impact**: Always estimate the impact in the `expected_impact` field (e.g., "~$15 saved/run", "~30% faster execution").
"""


# ─────────────────────────────────────────────────────────────────────────────
# RUN INTELLIGENCE ENGINE — SYSTEM PROMPT
# ─────────────────────────────────────────────────────────────────────────────

RIE_SYSTEM_PROMPT = f"""You are the FinOps CoPilot Run Intelligence Engine — a Databricks cost and performance optimization AI. You analyze RunIntelligenceSummary data (system tables, cluster events, driver logs) and return structured JSON recommendations.

{RIE_SKILLS}

Return ONLY valid JSON matching this schema (no markdown, no preamble):

{{
  "summary": "<2-3 sentence run health assessment>",
  "health_narrative": "<1 sentence explaining the health score>",
  "recommendations": [
    {{
      "dimension": "<infrastructure_sizing|cost_optimization|spark_configuration|transformation_query|data_quality|reliability_retries>",
      "priority": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "title": "<max 12 words>",
      "finding": "<detected issue with actual values, max 2 sentences>",
      "recommendation": "<specific fix with config/code, max 3 sentences>",
      "expected_impact": "<quantified: '$X saved/run' or '~30% faster'>",
      "code_or_config": "<optional Spark config, SQL, or JSON>"
    }}
  ],
  "data_source_coverage": {{
    "system_tables": <true|false>,
    "event_logs": <true|false>,
    "log_files": <true|false>
  }}
}}

Priority: CRITICAL=data loss/OOM crash/DQ drop>10%, HIGH=cost>20% over optimal/spill/retries>2, MEDIUM=sub-optimal config/Spot not enabled, LOW=minor tuning.
Order by priority. Max 8 recommendations.
"""


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT BUILDER HELPER
# ─────────────────────────────────────────────────────────────────────────────

def build_rie_user_prompt(
    summary: dict, 
    optimization_priorities: list[str] | None = None,
    workload_type: str = "Auto-detect",
    data_volume: str = "Unknown"
) -> str:
    """
    Build the user-turn prompt from a RunIntelligenceSummary dict.
    Trims signals to avoid token blowout while preserving all critical info.
    """
    import json

    priorities_str = ""
    if optimization_priorities:
        priorities_str = (
            f"\nFocus especially on: {', '.join(optimization_priorities)}\n"
        )
        
    context_str = ""
    if workload_type != "Auto-detect" or data_volume != "Unknown":
        context_str = f"\nWorkload Context:\n- Workload Type: {workload_type}\n- Data Volume: {data_volume}\n"

    # Trim signals by severity to keep token count manageable
    signals = summary.get("signals", [])
    trimmed_signals = []
    sev_budget = {"CRITICAL": 10, "HIGH": 8, "MEDIUM": 5, "LOW": 3, "INFO": 2}
    sev_counts: dict[str, int] = {}
    for s in signals:
        sev = s.get("severity", "INFO")
        if sev_counts.get(sev, 0) < sev_budget.get(sev, 2):
            trimmed_signals.append({k: v for k, v in s.items() if k != "sample"})
            sev_counts[sev] = sev_counts.get(sev, 0) + 1

    # Build compact payload (omit raw source data to save tokens)
    compact = {
        "entity":          summary.get("entity", {}),
        "timing":          summary.get("timing", {}),
        "cost":            {k: v for k, v in summary.get("cost", {}).items() if k != "sku_breakdown"},
        "infrastructure":  summary.get("infrastructure", {}),
        "data_metrics":    {k: v for k, v in summary.get("data_metrics", {}).items()
                            if k not in ("datasets", "flows")},
        "data_quality":    {k: v for k, v in summary.get("data_quality", {}).items()
                            if k != "expectations"},
        "dq_expectations": summary.get("data_quality", {}).get("expectations", [])[:10],
        "signals":         trimmed_signals,
        "scaling_events":  summary.get("scaling_events", [])[:10],
        "health":          summary.get("health", {}),
        "data_sources":    summary.get("data_sources", {}),
    }

    return (
        f"{priorities_str}{context_str}"
        f"Analyze this RunIntelligenceSummary and generate recommendations:\n\n"
        + json.dumps(compact, indent=2, default=str)
    )
