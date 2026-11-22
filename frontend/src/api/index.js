import { apiFetch, apiPost, apiDelete } from './client'

const addWs = (url, workspaceId) => workspaceId ? `${url}?workspace_id=${encodeURIComponent(workspaceId)}` : url;

export const overall = {
  kpi:            (workspaceId) => apiFetch(addWs('/overall/kpi', workspaceId)),
  trend:          (workspaceId) => apiFetch(addWs('/overall/trend', workspaceId)),
  skuBreakdown:   (workspaceId) => apiFetch(addWs('/overall/sku-breakdown', workspaceId)),
  anomaly:        (workspaceId) => apiFetch(addWs('/overall/anomaly', workspaceId)),
  workspaceCost:  (workspaceId) => apiFetch(addWs('/overall/workspace-cost', workspaceId)),
  skuWow:         (workspaceId) => apiFetch(addWs('/overall/sku-wow', workspaceId)),
  warehouseHealth:(workspaceId) => apiFetch(addWs('/overall/warehouse-health', workspaceId)),
  tagCoverage:    (workspaceId) => apiFetch(addWs('/overall/tag-coverage', workspaceId)),
  zombieRisk:     (workspaceId) => apiFetch(addWs('/overall/zombie-risk', workspaceId)),
  workspaces:     ()            => apiFetch('/overall/workspaces'),
}

export const interactive = {
  classicKpi:     (workspaceId) => apiFetch(addWs('/interactive/classic/kpi', workspaceId)),
  classicClusters:(workspaceId) => apiFetch(addWs('/interactive/classic/clusters', workspaceId)),
  classicDaily:   (workspaceId) => apiFetch(addWs('/interactive/classic/daily', workspaceId)),
  serverlessKpi:  (workspaceId) => apiFetch(addWs('/interactive/serverless/kpi', workspaceId)),
  serverlessDaily:(workspaceId) => apiFetch(addWs('/interactive/serverless/daily', workspaceId)),
  sessionScan:    (workspaceId) => apiFetch(addWs('/interactive/session-scan', workspaceId)),
}

export const jobs = {
  classicKpi:     (workspaceId) => apiFetch(addWs('/jobs/classic/kpi', workspaceId)),
  classicTop:     (workspaceId) => apiFetch(addWs('/jobs/classic/top', workspaceId)),
  classicDaily:   (workspaceId) => apiFetch(addWs('/jobs/classic/daily', workspaceId)),
  serverlessKpi:  (workspaceId) => apiFetch(addWs('/jobs/serverless/kpi', workspaceId)),
  serverlessTop:  (workspaceId) => apiFetch(addWs('/jobs/serverless/top', workspaceId)),
  serverlessDaily:(workspaceId) => apiFetch(addWs('/jobs/serverless/daily', workspaceId)),
  failedCost:     (workspaceId) => apiFetch(addWs('/jobs/failed-cost', workspaceId)),
  weeklyTrend:    (workspaceId) => apiFetch(addWs('/jobs/weekly-trend', workspaceId)),
}

export const sqlWarehouse = {
  health:         (workspaceId) => apiFetch(addWs('/sql-warehouse/health', workspaceId)),
  heatmap:        (workspaceId) => apiFetch(addWs('/sql-warehouse/heatmap', workspaceId)),
  topQueries:     (workspaceId) => apiFetch(addWs('/sql-warehouse/top-queries', workspaceId)),
  cacheTrend:     (workspaceId) => apiFetch(addWs('/sql-warehouse/cache-trend', workspaceId)),
  classicCost:    (workspaceId) => apiFetch(addWs('/sql-warehouse/classic/cost', workspaceId)),
  classicDaily:   (workspaceId) => apiFetch(addWs('/sql-warehouse/classic/daily', workspaceId)),
  serverlessCost: (workspaceId) => apiFetch(addWs('/sql-warehouse/serverless/cost', workspaceId)),
  serverlessDaily:(workspaceId) => apiFetch(addWs('/sql-warehouse/serverless/daily', workspaceId)),
  idleBilling:    (workspaceId) => apiFetch(addWs('/sql-warehouse/idle-billing', workspaceId)),
  repeatQueryKpi: (workspaceId) => apiFetch(addWs('/sql-warehouse/repeat-query-kpi', workspaceId)),
}

export const dlt = {
  kpi:                (workspaceId) => apiFetch(addWs('/dlt/kpi', workspaceId)),
  classicKpi:         (workspaceId) => apiFetch(addWs('/dlt/classic/kpi', workspaceId)),
  classicPipelines:   (workspaceId) => apiFetch(addWs('/dlt/classic/pipelines', workspaceId)),
  classicDaily:       (workspaceId) => apiFetch(addWs('/dlt/classic/daily', workspaceId)),
  serverlessKpi:      (workspaceId) => apiFetch(addWs('/dlt/serverless/kpi', workspaceId)),
  serverlessPipelines:(workspaceId) => apiFetch(addWs('/dlt/serverless/pipelines', workspaceId)),
  serverlessDaily:    (workspaceId) => apiFetch(addWs('/dlt/serverless/daily', workspaceId)),
  pipelineHealth:     (workspaceId) => apiFetch(addWs('/dlt/pipeline-health', workspaceId)),
  healthKpi:          (workspaceId) => apiFetch(addWs('/dlt/health-kpi', workspaceId)),
}

export const storage = {
  costTrend:      (workspaceId) => apiFetch(addWs('/storage/cost-trend', workspaceId)),
  tableSizes:     (workspaceId) => apiFetch(addWs('/storage/table-sizes', workspaceId)),
  zombieRisk:     (workspaceId) => apiFetch(addWs('/storage/zombie-risk', workspaceId)),
  kpi:            (workspaceId) => apiFetch(addWs('/storage/kpi', workspaceId)),
  vacuumCompliance:(workspaceId) => apiFetch(addWs('/storage/vacuum-compliance', workspaceId)),
  retain0Kpi:     (workspaceId) => apiFetch(addWs('/storage/retain0-kpi', workspaceId)),
  userCostLeaderboard: (workspaceId) => apiFetch(addWs('/storage/user-cost-leaderboard', workspaceId)),
}

export const chargeback = {
  teamSpend:      (workspaceId) => apiFetch(addWs('/chargeback/team-spend', workspaceId)),
  tagCoverage:    (workspaceId) => apiFetch(addWs('/chargeback/tag-coverage', workspaceId)),
  kpis:           (workspaceId) => apiFetch(addWs('/chargeback/kpis', workspaceId)),
}

export const queryIntelligence = {
  kpi:              (workspaceId) => apiFetch(addWs('/query-intelligence/kpi', workspaceId)),
  spillEvents:      (workspaceId) => apiFetch(addWs('/query-intelligence/spill-events', workspaceId)),
  spillKpi:         (workspaceId) => apiFetch(addWs('/query-intelligence/spill-kpi', workspaceId)),
  repeatQueries:    (workspaceId) => apiFetch(addWs('/query-intelligence/repeat-queries', workspaceId)),
  cacheBreakerUsers:(workspaceId) => apiFetch(addWs('/query-intelligence/cache-breaker-users', workspaceId)),
  shuffleRatio:     (workspaceId) => apiFetch(addWs('/query-intelligence/shuffle-ratio', workspaceId)),
}

export const merge = {
  kpi:             (workspaceId) => apiFetch(addWs('/merge/kpi', workspaceId)),
  trend:           (workspaceId) => apiFetch(addWs('/merge/trend', workspaceId)),
  lcCandidates:    (workspaceId) => apiFetch(addWs('/merge/lc-candidates', workspaceId)),
  writeAmplification: (workspaceId) => apiFetch(addWs('/merge/write-amplification', workspaceId)),
  pysparkWriteAudit:  (workspaceId) => apiFetch(addWs('/merge/pyspark-write-audit', workspaceId)),
}

export const cache = {
  invalidate: (section) => apiDelete(`/cache/${section}`),
  clearAll:   ()        => apiDelete('/cache'),
  refresh:    ()        => apiPost('/cache/refresh', {}),
  stats:      ()        => apiFetch('/cache/stats'),
}

export const analyzeAPI = {
  detect: (dashboardId, metrics) => apiPost('/analyze', { dashboard_id: dashboardId, metrics }),
}

export const runIntelligence = {
  listJobs:     (params = {}) => {
    let q = `lookback_days=${params.lookback_days || 30}&max_jobs=${params.max_jobs || 50}`;
    if (params.search) q += `&search=${encodeURIComponent(params.search)}`;
    if (params.workspace_id) q += `&workspace_id=${encodeURIComponent(params.workspace_id)}`;
    return apiFetch(`/run-intelligence/jobs?${q}`);
  },
  listRuns:     (jobId, params = {}) => {
    let q = `max_runs=${params.max || 20}`;
    if (params.workspace_id) q += `&workspace_id=${encodeURIComponent(params.workspace_id)}`;
    return apiFetch(`/run-intelligence/jobs/${jobId}/runs?${q}`);
  },
  listPipelines:(params = {}) => {
    let q = `lookback_days=${params.lookback_days || 30}&max_pipelines=${params.max_pipelines || 30}`;
    if (params.search) q += `&search=${encodeURIComponent(params.search)}`;
    if (params.workspace_id) q += `&workspace_id=${encodeURIComponent(params.workspace_id)}`;
    return apiFetch(`/run-intelligence/pipelines?${q}`);
  },
  listUpdates:  (pipelineId, params = {}) => {
    let q = `max_updates=${params.max || 20}`;
    if (params.workspace_id) q += `&workspace_id=${encodeURIComponent(params.workspace_id)}`;
    return apiFetch(`/run-intelligence/pipelines/${pipelineId}/updates?${q}`);
  },
  analyzeRun:   (body) => apiPost('/run-intelligence/analyze', body),
  aiRecs:       (body) => apiPost('/run-intelligence/ai-recommendations', body),
}

export const lookup = {
  job: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/job?${q}`);
  },
  pipeline: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/pipeline?${q}`);
  },
  cluster: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/cluster?${q}`);
  },
  warehouse: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/warehouse?${q}`);
  },
  user: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/user?${q}`);
  },
  notebook: (search, days, workspaceId) => {
    let q = `search=${encodeURIComponent(search)}&days=${days}`;
    if (workspaceId) q += `&workspace_id=${encodeURIComponent(workspaceId)}`;
    return apiFetch(`/lookup/notebook?${q}`);
  },
}

