import { useEffect, useState } from 'react'
import { runIntelligence as api, overall } from '../api/index'
import MetricCard from '../components/kpi/MetricCard'

const SEV_COLOUR = {
  CRITICAL: '#ff3366',
  HIGH: '#ffaa00',
  MEDIUM: '#ffd700',
  LOW: '#90ee90',
  INFO: '#4fc3f7',
}

const DIM_ICON = {
  infrastructure_sizing: '🖥️',
  cost_optimization: '💰',
  spark_configuration: '⚙️',
  transformation_query: '🔄',
  data_quality: '🛡️',
  reliability_retries: '🔁',
}

export default function RunIntelligence() {
  const [activeTab, setActiveTab] = useState('analyze')
  const [entityType, setEntityType] = useState('job')
  
  // Workspace states
  const [workspacesList, setWorkspacesList] = useState([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [workspaceSearchMode, setWorkspaceSearchMode] = useState('dropdown') // 'dropdown' | 'manual'
  const [wsSearchInput, setWsSearchInput] = useState('')
  const [wsSearchType, setWsSearchType] = useState('name') // 'name' | 'id'
  const [wsMatches, setWsMatches] = useState([])
  const [wsResolvedName, setWsResolvedName] = useState('')
  const [wsError, setWsError] = useState('')
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)

  // Job / Pipeline search states
  const [searchMode, setSearchMode] = useState('id') // 'id' | 'name'
  const [entitySearchInput, setEntitySearchInput] = useState('')
  const [entities, setEntities] = useState([])
  const [selectedEntityId, setSelectedEntityId] = useState('')
  const [selectedEntityName, setSelectedEntityName] = useState('')
  const [loadingEntities, setLoadingEntities] = useState(false)
  const [entityError, setEntityError] = useState('')

  // Runs states
  const [runs, setRuns] = useState([])
  const [selectedRunId, setSelectedRunId] = useState('')
  const [manualRunId, setManualRunId] = useState('') // manual text override
  const [loadingRuns, setLoadingRuns] = useState(false)

  // Diagnostics states
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [generatingAi, setGeneratingAi] = useState(false)
  const [aiResult, setAiResult] = useState(null)

  // Advanced Config state
  const [workloadType, setWorkloadType] = useState('Auto-detect')
  const [dataVolume, setDataVolume] = useState('Unknown')
  const [optPriorities, setOptPriorities] = useState(['💰 Cost', '⚡ Speed', '🛡️ Reliability', '🔒 Data Quality'])
  const [baseline, setBaseline] = useState('Last Successful Run')
  const [baselineRunId, setBaselineRunId] = useState('')
  const [logFiles, setLogFiles] = useState(true)
  const [clusterEvents, setClusterEvents] = useState(true)
  const [dltEvents, setDltEvents] = useState(true)
  const [storagePath, setStoragePath] = useState('')
  const [ucTable, setUcTable] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleRefreshWorkspaces = async () => {
    setLoadingWorkspaces(true)
    try {
      const res = await overall.workspaces()
      if (res && res.length > 0) {
        setWorkspacesList(res)
        setSelectedWorkspaceId(res[0].workspace_id)
      } else {
        setWorkspacesList([])
        setSelectedWorkspaceId('')
      }
    } catch (err) {
      console.error('Error fetching workspaces:', err)
      setWorkspacesList([])
      setSelectedWorkspaceId('')
    } finally {
      setLoadingWorkspaces(false)
    }
  }

  // Fetch workspaces on mount
  useEffect(() => {
    handleRefreshWorkspaces()
  }, [])

  // Reset entity selection on entityType or workspace change
  useEffect(() => {
    setSearchMode('id')
    setEntities([])
    setSelectedEntityId('')
    setSelectedEntityName('')
    setRuns([])
    setSelectedRunId('')
    setManualRunId('')
    setAnalysisResult(null)
    setAiResult(null)
    setEntityError('')
  }, [entityType, selectedWorkspaceId])

  // Resolve Workspace
  const handleResolveWorkspace = () => {
    setWsError('')
    setWsMatches([])
    setWsResolvedName('')
    setSelectedWorkspaceId('')

    const query = wsSearchInput.trim()
    if (!query) {
      setWsError('Please enter a workspace search term.')
      return
    }

    if (wsSearchType === 'id') {
      const matched = workspacesList.find(w => w.workspace_id === query)
      if (matched) {
        setSelectedWorkspaceId(matched.workspace_id)
        setWsResolvedName(`${matched.workspace_name} (${matched.workspace_id})`)
      } else {
        setSelectedWorkspaceId(query)
        setWsResolvedName(`Manual Workspace (${query})`)
      }
    } else {
      const matches = workspacesList.filter(w => 
        w.workspace_name.toLowerCase().includes(query.toLowerCase())
      )
      if (matches.length === 1) {
        setSelectedWorkspaceId(matches[0].workspace_id)
        setWsResolvedName(`${matches[0].workspace_name} (${matches[0].workspace_id})`)
      } else if (matches.length > 1) {
        setWsMatches(matches)
      } else {
        setWsError(`No workspace found containing "${query}".`)
      }
    }
  }

  const handleSelectWorkspaceMatch = (ws) => {
    setSelectedWorkspaceId(ws.workspace_id)
    setWsResolvedName(`${ws.workspace_name} (${ws.workspace_id})`)
    setWsMatches([])
  }

  // Load Job/Pipeline Entities (Search & Confirm Flow)
  const handleSearchEntities = async () => {
    setEntityError('')
    setEntities([])
    setSelectedEntityId('')
    setSelectedEntityName('')
    setRuns([])
    setSelectedRunId('')
    setManualRunId('')

    const query = entitySearchInput.trim()
    if (!query) {
      setEntityError(`Please enter a ${entityType} name to search.`)
      return
    }

    setLoadingEntities(true)
    try {
      const params = {
        search: query,
        workspace_id: selectedWorkspaceId || undefined,
        lookback_days: 90,
        max_jobs: 50,
        max_pipelines: 30
      }
      
      let res
      if (entityType === 'job') {
        res = await api.listJobs(params)
      } else {
        res = await api.listPipelines(params)
      }
      
      if (!res || res.length === 0) {
        setEntityError(`No matching ${entityType}s found containing "${query}".`)
      } else {
        setEntities(res)
      }
    } catch (err) {
      setEntityError(`Failed to fetch ${entityType}s.`)
      console.error(err)
    } finally {
      setLoadingEntities(false)
    }
  }

  // Load Runs directly using ID (Direct ID flow)
  const handleLoadRunsDirectly = async (forcedId = null) => {
    const idToUse = forcedId || entitySearchInput.trim()
    if (!idToUse) {
      setEntityError(`Please enter a ${entityType} ID.`)
      return
    }

    setEntityError('')
    setEntities([])
    setSelectedEntityId(idToUse)
    setSelectedEntityName(idToUse)
    setRuns([])
    setSelectedRunId('')
    setManualRunId('')
    setLoadingRuns(true)

    try {
      const params = {
        max: 30,
        workspace_id: selectedWorkspaceId || undefined
      }
      let res
      if (entityType === 'job') {
        res = await api.listRuns(idToUse, params)
      } else {
        res = await api.listUpdates(idToUse, params)
      }
      setRuns(res || [])
      if (!res || res.length === 0) {
        setEntityError(`No runs found for ${entityType} ID "${idToUse}".`)
      }
    } catch (err) {
      setEntityError(`Failed to fetch runs/updates for ID "${idToUse}".`)
      console.error(err)
    } finally {
      setLoadingRuns(false)
    }
  }

  // Select an entity and load its runs/updates automatically
  const handleSelectEntity = async (entity) => {
    const id = entity.job_id || entity.pipeline_id
    const name = entity.display_name || entity.pipeline_id || id
    setSelectedEntityId(id)
    setSelectedEntityName(name)
    
    setLoadingRuns(true)
    setRuns([])
    setSelectedRunId('')
    setManualRunId('')
    
    try {
      const params = {
        max: 30,
        workspace_id: selectedWorkspaceId || undefined
      }
      let res
      if (entityType === 'job') {
        res = await api.listRuns(id, params)
      } else {
        res = await api.listUpdates(id, params)
      }
      setRuns(res || [])
    } catch (err) {
      console.error('Error fetching runs:', err)
    } finally {
      setLoadingRuns(false)
    }
  }

  const handleAnalyze = async () => {
    const runIdToUse = manualRunId.trim() || selectedRunId
    if (!selectedEntityId || !runIdToUse) return
    
    setAnalyzing(true)
    setAnalysisResult(null)
    setAiResult(null)
    
    try {
      const res = await api.analyzeRun({
        entity_type: entityType,
        entity_id: selectedEntityId,
        run_id: runIdToUse,
        entity_name: selectedEntityName,
        baseline_type: baseline,
        baseline_run_id: baselineRunId,
        include_log_files: logFiles,
        include_cluster_events: clusterEvents,
        workload_type: workloadType,
        data_volume: dataVolume,
        optimization_priorities: optPriorities,
        dlt_storage_location: storagePath,
        dlt_uc_table: ucTable
      })
      setAnalysisResult(res)
    } catch (err) {
      console.error(err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleGenerateAi = async () => {
    if (!analysisResult) return
    setGeneratingAi(true)
    try {
      const res = await api.aiRecs({
        summary: analysisResult,
        optimization_priorities: optPriorities,
        workload_type: workloadType,
        data_volume: dataVolume
      })
      setAiResult(res)
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingAi(false)
    }
  }

  // Diagnostics summaries
  const timing = analysisResult?.timing || {}
  const cost = analysisResult?.cost || {}
  const health = analysisResult?.health || {}
  const dm = analysisResult?.data_metrics || {}
  const dq = analysisResult?.data_quality || {}
  const infra = analysisResult?.infrastructure || {}
  const signals = analysisResult?.signals || []

  // vs Baseline
  const vs = timing.vs_baseline_pct
  const vsStr = vs != null ? (vs > 0 ? `+${vs.toFixed(1)}% slower` : `${Math.abs(vs).toFixed(1)}% faster`) : 'No baseline'
  const vsColor = vs != null ? (vs > 5 ? '#ff3366' : (vs < -5 ? '#00ff88' : '#8892a4')) : '#8892a4'

  // Dynamic values
  const dur = timing.duration_mins
  const durStr = dur != null ? `${dur.toFixed(1)} min` : 'N/A'
  const durColor = vs != null ? (vs > 10 ? '#ff3366' : (vs > 0 ? '#ffaa00' : '#00ff88')) : '#00d4ff'

  const costUsd = cost.total_cost_usd
  const costStr = costUsd != null ? `$${costUsd.toFixed(2)}` : 'N/A'
  let costColor = '#b388ff'
  const costVs = cost.vs_baseline_pct
  const baselineProxy = costVs != null ? costVs : vs
  if (baselineProxy != null) {
    costColor = baselineProxy > 10 ? '#ff3366' : (baselineProxy > 0 ? '#ffaa00' : '#00ff88')
  } else {
    costColor = '#00d4ff'
  }

  const healthScore = health.score ?? 100
  const scoreColor = healthScore >= 80 ? '#00ff88' : (healthScore >= 50 ? '#ffaa00' : '#ff3366')

  const rowsOut = dm.rows_out || dm.total_rows_out
  const rowsStr = rowsOut != null ? rowsOut.toLocaleString() : 'N/A'
  const rowsColor = rowsOut ? '#00ff88' : '#8892a4'

  const critCount = signals.filter(s => s.severity === 'CRITICAL').length
  const issuesColor = signals.length === 0 ? '#00ff88' : (critCount > 0 ? '#ff3366' : '#ffaa00')

  const dltWorkerStr = infra.is_serverless ? 'Auto-scaled' : (infra.autoscale ? `${infra.autoscale.min_workers}-${infra.autoscale.max_workers} (autoscale)` : (infra.num_workers ? String(infra.num_workers) : 'N/A'))

  return (
    <div>
      <div className="section-header-row" style={{ marginBottom: 16 }}>
        <div className="title-block">
          <div className="panel-title">⚡ Run Intelligence Engine</div>
          <div className="panel-subtitle">Multi-source AI analyzer · System Tables · Cluster Events · Driver Logs</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab('analyze')}
          style={{
            padding: '10px 16px',
            background: activeTab === 'analyze' ? 'var(--toggle-active-bg)' : 'transparent',
            boxShadow: activeTab === 'analyze' ? 'var(--toggle-active-shadow)' : 'none',
            border: activeTab === 'analyze' ? '1px solid var(--border)' : 'none',
            color: activeTab === 'analyze' ? 'var(--text-hi)' : 'var(--text-lo)',
            borderRadius: 4,
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          🔍 Analyze Run
        </button>
        <button
          onClick={() => setActiveTab('setup')}
          style={{
            padding: '10px 16px',
            background: activeTab === 'setup' ? 'var(--toggle-active-bg)' : 'transparent',
            boxShadow: activeTab === 'setup' ? 'var(--toggle-active-shadow)' : 'none',
            border: activeTab === 'setup' ? '1px solid var(--border)' : 'none',
            color: activeTab === 'setup' ? 'var(--text-hi)' : 'var(--text-lo)',
            borderRadius: 4,
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          ⚙️ Setup &amp; Config
        </button>
      </div>

      {activeTab === 'analyze' ? (
        <div>
          {/* Target workspace & entity selection */}
          <div className="dashboard-panel" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
            
            {/* Workspace Scope Selector */}
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-hi)' }}>📍 Workspace Scope Selector</span>
                <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 6, padding: 2 }}>
                  <button
                    onClick={() => setWorkspaceSearchMode('dropdown')}
                    style={{
                      background: workspaceSearchMode === 'dropdown' ? 'var(--toggle-active-bg)' : 'transparent',
                      boxShadow: workspaceSearchMode === 'dropdown' ? 'var(--toggle-active-shadow)' : 'none',
                      color: workspaceSearchMode === 'dropdown' ? 'var(--text-hi)' : 'var(--text-lo)',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  >
                    Dropdown List
                  </button>
                  <button
                    onClick={() => setWorkspaceSearchMode('manual')}
                    style={{
                      background: workspaceSearchMode === 'manual' ? 'var(--toggle-active-bg)' : 'transparent',
                      boxShadow: workspaceSearchMode === 'manual' ? 'var(--toggle-active-shadow)' : 'none',
                      color: workspaceSearchMode === 'manual' ? 'var(--text-hi)' : 'var(--text-lo)',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 'bold'
                    }}
                  >
                    Manual Lookup
                  </button>
                </div>
              </div>

              {workspaceSearchMode === 'dropdown' ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-hi)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      height: 38
                    }}
                  >
                    <option value="">All Account Workspaces</option>
                    {workspacesList.map(w => (
                      <option key={w.workspace_id} value={w.workspace_id}>
                        📁 {w.workspace_name} ({w.workspace_id})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleRefreshWorkspaces}
                    disabled={loadingWorkspaces}
                    style={{
                      background: 'var(--surface2)',
                      color: 'var(--text-hi)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '8px 12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {loadingWorkspaces ? '⏳' : '🔄'} Load
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="rieWsSearchType" 
                        value="name" 
                        checked={wsSearchType === 'name'} 
                        onChange={() => setWsSearchType('name')}
                      />
                      <span>Workspace Name</span>
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="rieWsSearchType" 
                        value="id" 
                        checked={wsSearchType === 'id'} 
                        onChange={() => setWsSearchType('id')}
                      />
                      <span>Workspace ID</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      value={wsSearchInput}
                      onChange={(e) => setWsSearchInput(e.target.value)}
                      placeholder={wsSearchType === 'id' ? 'Enter numerical Workspace ID...' : 'Enter workspace name keyword...'}
                      style={{
                        flex: 1,
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-hi)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        height: 38
                      }}
                    />
                    <button
                      onClick={handleResolveWorkspace}
                      style={{
                        background: 'var(--surface2)',
                        color: 'var(--text-hi)',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '8px 16px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Resolve
                    </button>
                  </div>

                  {wsError && <div style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {wsError}</div>}
                  
                  {wsResolvedName && (
                    <div style={{ background: 'rgba(0, 255, 136, 0.08)', border: '1px solid rgba(0, 255, 136, 0.3)', padding: '8px 12px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: '#00ff88', fontSize: 14 }}>✓</span>
                      <span style={{ fontSize: 12, color: 'var(--text-hi)' }}>
                        Selected Workspace: <strong>{wsResolvedName}</strong> (ID: <code>{selectedWorkspaceId}</code>)
                      </span>
                    </div>
                  )}

                  {wsMatches.length > 0 && (
                    <div style={{ background: 'var(--bg2)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Multiple workspaces matched. Select one:</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {wsMatches.map(w => (
                          <button
                            key={w.workspace_id}
                            onClick={() => handleSelectWorkspaceMatch(w)}
                            style={{
                              textAlign: 'left',
                              background: 'var(--surface2)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-hi)',
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontSize: 12,
                              cursor: 'pointer'
                            }}
                          >
                            📁 {w.workspace_name} ({w.workspace_id})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Entity Type Toggle */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                <input
                  type="radio"
                  name="entityType"
                  value="job"
                  checked={entityType === 'job'}
                  onChange={() => setEntityType('job')}
                />
                <span>🔧 Job Run Intelligence</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                <input
                  type="radio"
                  name="entityType"
                  value="pipeline"
                  checked={entityType === 'pipeline'}
                  onChange={() => setEntityType('pipeline')}
                />
                <span>🔀 DLT Pipeline Update Intelligence</span>
              </label>
            </div>

            {/* Entity Search and Identity Mode Controls */}
            <div className="grid-4-equal" style={{ gap: 12, alignItems: 'center', marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Identify Mode</label>
                <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 4, padding: 2, height: 38, border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => {
                      setSearchMode('id')
                      setEntities([])
                      setSelectedEntityId('')
                      setSelectedEntityName('')
                      setRuns([])
                      setSelectedRunId('')
                      setManualRunId('')
                      setEntityError('')
                    }}
                    style={{
                      flex: 1,
                      background: searchMode === 'id' ? 'var(--toggle-active-bg)' : 'transparent',
                      boxShadow: searchMode === 'id' ? 'var(--toggle-active-shadow)' : 'none',
                      color: searchMode === 'id' ? 'var(--text-hi)' : 'var(--text-lo)',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}
                  >
                    ID
                  </button>
                  <button
                    onClick={() => {
                      setSearchMode('name')
                      setEntities([])
                      setSelectedEntityId('')
                      setSelectedEntityName('')
                      setRuns([])
                      setSelectedRunId('')
                      setManualRunId('')
                      setEntityError('')
                    }}
                    style={{
                      flex: 1,
                      background: searchMode === 'name' ? 'var(--toggle-active-bg)' : 'transparent',
                      boxShadow: searchMode === 'name' ? 'var(--toggle-active-shadow)' : 'none',
                      color: searchMode === 'name' ? 'var(--text-hi)' : 'var(--text-lo)',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}
                  >
                    Name
                  </button>
                </div>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>
                  {searchMode === 'id' ? `${entityType.toUpperCase()} ID` : `${entityType.toUpperCase()} Name keyword`}
                </label>
                <input
                  type="text"
                  value={entitySearchInput}
                  onChange={(e) => setEntitySearchInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      if (searchMode === 'id') {
                        handleLoadRunsDirectly()
                      } else {
                        handleSearchEntities()
                      }
                    }
                  }}
                  placeholder={searchMode === 'id' ? `Enter exact ${entityType} ID` : `Enter partial ${entityType} name`}
                  style={{
                    width: '100%',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-hi)',
                    borderRadius: 4,
                    padding: '8px 12px',
                    height: 38
                  }}
                />
              </div>

              <div style={{ alignSelf: 'end' }}>
                {searchMode === 'id' ? (
                  <button
                    onClick={() => handleLoadRunsDirectly()}
                    disabled={loadingRuns}
                    style={{
                      width: '100%',
                      background: '#00ff88',
                      color: '#0d1220',
                      border: 'none',
                      fontWeight: 'bold',
                      borderRadius: 4,
                      cursor: 'pointer',
                      height: 38
                    }}
                  >
                    {loadingRuns ? '⏳ Loading Runs…' : '🔍 Load Runs'}
                  </button>
                ) : (
                  <button
                    onClick={handleSearchEntities}
                    disabled={loadingEntities}
                    style={{
                      width: '100%',
                      background: '#00d4ff',
                      color: '#0d1220',
                      border: 'none',
                      fontWeight: 'bold',
                      borderRadius: 4,
                      cursor: 'pointer',
                      height: 38
                    }}
                  >
                    {loadingEntities ? '⏳ Finding…' : '🔍 Find Matches'}
                  </button>
                )}
              </div>
            </div>

            {entityError && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>⚠️ {entityError}</div>}

            {/* Resolved dropdown selector for Name Search Mode */}
            {searchMode === 'name' && entities.length > 0 && (
              <div style={{
                marginBottom: 16,
                background: 'var(--bg2)',
                padding: 14,
                borderRadius: 6,
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}>
                <label style={{ fontSize: 11, color: '#8892a4', display: 'block' }}>
                  Select resolved {entityType} from matches:
                </label>
                <select
                  value={selectedEntityId}
                  onChange={(e) => {
                    const val = e.target.value
                    if (!val) {
                      setSelectedEntityId('')
                      setSelectedEntityName('')
                      setRuns([])
                      setSelectedRunId('')
                    } else {
                      const matched = entities.find(ent => String(ent.job_id || ent.pipeline_id) === val)
                      if (matched) {
                        handleSelectEntity(matched)
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-hi)',
                    borderRadius: 4,
                    padding: '8px 12px',
                    height: 38
                  }}
                >
                  <option value="">-- Choose matching {entityType} --</option>
                  {entities.map(e => {
                    const id = e.job_id || e.pipeline_id
                    const display = e.display_name || e.pipeline_id || id
                    return (
                      <option key={id} value={id}>
                        {display} ({id}) {e.total_runs ? `· ${e.total_runs} runs` : ''} {e.total_updates ? `· ${e.total_updates} updates` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Selected Resource Confirmation Badge */}
            {selectedEntityId && (
              <div style={{
                background: 'rgba(0, 212, 255, 0.05)',
                border: '1px solid rgba(0, 212, 255, 0.25)',
                padding: '12px 16px',
                borderRadius: 6,
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: 11, color: '#00d4ff', textTransform: 'uppercase', fontWeight: 'bold', display: 'block', marginBottom: 2 }}>
                    Confirmed Diagnostic Target
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-hi)' }}>
                    {selectedEntityName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                    (ID: <code>{selectedEntityId}</code>)
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSelectedEntityId('')
                    setSelectedEntityName('')
                    setRuns([])
                    setSelectedRunId('')
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ff3366',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 'bold'
                  }}
                >
                  Change Target
                </button>
              </div>
            )}

            {/* Runs cascading selection */}
            {selectedEntityId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg2)', padding: 14, borderRadius: 6, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-hi)' }}>Select Run Execution context</div>
                
                <div className="grid-2" style={{ gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>
                      Choose Run/Update ID (From Dropdown)
                    </label>
                    <select
                      value={selectedRunId}
                      onChange={(e) => {
                        setSelectedRunId(e.target.value)
                        setManualRunId('')
                      }}
                      disabled={loadingRuns}
                      style={{
                        width: '100%',
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-hi)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        height: 38
                      }}
                    >
                      <option value="">{loadingRuns ? '⏳ Loading Runs…' : `Select a recent run`}</option>
                      {runs.map(r => {
                        const runId = r.run_id || r.update_id
                        const durVal = r.duration_seconds
                        const durStrVal = durVal ? `${Math.floor(durVal / 60)}m ${Math.floor(durVal % 60)}s` : ''
                        const state = r.result_state || r.state || '?'
                        const icon = state === 'SUCCEEDED' || state === 'COMPLETED' ? '✅' : (state === 'FAILED' ? '❌' : '⏳')
                        return (
                          <option key={runId} value={runId}>
                            {icon} {runId.slice(0, 12)}… · {state} {durStrVal ? `· ${durStrVal}` : ''}
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>
                      Or Provide Run ID Manually (Override)
                    </label>
                    <input
                      type="text"
                      value={manualRunId}
                      onChange={(e) => {
                        setManualRunId(e.target.value)
                        setSelectedRunId('')
                      }}
                      placeholder="Paste specific Run/Update UUID..."
                      style={{
                        width: '100%',
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-hi)',
                        borderRadius: 4,
                        padding: '8px 12px',
                        height: 38
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Expander header */}
            {selectedEntityId && (selectedRunId || manualRunId.trim()) && (
              <div style={{ marginTop: 12 }}>
                <div
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#00d4ff',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  {showAdvanced ? '▲ Hide Advanced Configuration' : '▼ View Advanced Configuration'}
                </div>
                {showAdvanced && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 4
                  }}>
                    <div className="grid-4-equal" style={{ gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Workload type</label>
                        <select
                          value={workloadType}
                          onChange={(e) => setWorkloadType(e.target.value)}
                          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 6 }}
                        >
                          <option value="Auto-detect">Auto-detect</option>
                          <option value="Ingestion">Ingestion</option>
                          <option value="Transformation">Transformation</option>
                          <option value="ML Training">ML Training</option>
                          <option value="Streaming">Streaming</option>
                          <option value="Reporting">Reporting</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Data volume</label>
                        <select
                          value={dataVolume}
                          onChange={(e) => setDataVolume(e.target.value)}
                          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 6 }}
                        >
                          <option value="Unknown">Unknown</option>
                          <option value="< 10 GB">&lt; 10 GB</option>
                          <option value="10–100 GB">10–100 GB</option>
                          <option value="100 GB–1 TB">100 GB–1 TB</option>
                          <option value="> 1 TB">&gt; 1 TB</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Comparison baseline</label>
                        <select
                          value={baseline}
                          onChange={(e) => setBaseline(e.target.value)}
                          style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 6 }}
                        >
                          <option value="Last Successful Run">Last Successful Run</option>
                          <option value="Previous Run">Previous Run</option>
                          <option value="Specific Run ID">Specific Run ID</option>
                          <option value="None">None</option>
                        </select>
                      </div>

                      {baseline === 'Specific Run ID' && (
                        <div>
                          <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Run ID</label>
                          <input
                            type="text"
                            value={baselineRunId}
                            onChange={(e) => setBaselineRunId(e.target.value)}
                            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 6 }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="grid-2" style={{ gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#8892a4' }}>Log Sources</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={logFiles} onChange={(e) => setLogFiles(e.target.checked)} />
                          <span>Include Volume log files (auto-detect)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="checkbox" checked={clusterEvents} onChange={(e) => setClusterEvents(e.target.checked)} />
                          <span>Include cluster event logs</span>
                        </label>
                      </div>

                      {entityType === 'pipeline' && (
                        <div>
                          <label style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#8892a4' }}>DLT Event Logs</label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={dltEvents} onChange={(e) => setDltEvents(e.target.checked)} />
                            <span>Include DLT event log table</span>
                          </label>
                          {dltEvents && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                type="text"
                                value={storagePath}
                                onChange={(e) => setStoragePath(e.target.value)}
                                placeholder="Storage Location"
                                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 4, fontSize: 11 }}
                              />
                              <input
                                type="text"
                                value={ucTable}
                                onChange={(e) => setUcTable(e.target.value)}
                                placeholder="UC Table Name"
                                style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 4, padding: 4, fontSize: 11 }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedEntityId && (selectedRunId || manualRunId.trim()) && (
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                style={{
                  width: '100%',
                  marginTop: 16,
                  background: '#00d4ff',
                  color: '#0d1220',
                  border: 'none',
                  fontWeight: 'bold',
                  borderRadius: 4,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                {analyzing ? '⏳ Running Diagnostics…' : '⚡ Run Diagnostics'}
              </button>
            )}
          </div>

          {/* Results render */}
          {analyzing && (
            <div className="spinner-wrap" style={{ padding: '60px 0' }}>
              <div className="spinner" />
              <span>Fetching and compiling cluster logs, event records, and billing schemas…</span>
            </div>
          )}

          {analysisResult && (
            <div style={{ marginTop: 24 }}>
              {/* Badges */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--surface2)', fontSize: 11, border: '1px solid var(--border)', color: 'var(--text-hi)' }}>
                  {analysisResult.data_sources?.system_tables ? '✅ System Tables' : '❌ System Tables'}
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--surface2)', fontSize: 11, border: '1px solid var(--border)', color: 'var(--text-hi)' }}>
                  {analysisResult.data_sources?.event_logs ? '✅ Event Logs' : '⚠️ Event Logs'}
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 4, background: 'var(--surface2)', fontSize: 11, border: '1px solid var(--border)', color: 'var(--text-hi)' }}>
                  {analysisResult.data_sources?.log_files ? '✅ Driver Logs' : '⚠️ Driver Logs (not found)'}
                </span>
              </div>

              {/* KPI cards grid */}
              <div className="grid-6" style={{ gap: 12, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>⏱️ Duration</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: durColor }}>{durStr}</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>Run time</div>
                </div>

                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>💰 Total Cost</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: costColor }}>{costStr}</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>Est. USD</div>
                </div>

                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>🧬 Health Score</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{healthScore}/100</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>All sources</div>
                </div>

                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>📦 Rows Processed</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: rowsColor }}>{rowsStr}</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>Output rows</div>
                </div>

                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>⚠️ Issues</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: issuesColor }}>{signals.length}</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>{critCount} critical</div>
                </div>

                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>📈 vs Baseline</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: vsColor }}>{vsStr}</div>
                  <div style={{ fontSize: 9, color: '#8892a4', marginTop: 2 }}>Duration δ</div>
                </div>
              </div>

              {/* Infrastructure details */}
              <div className="grid-5" style={{ gap: 10, marginBottom: 24 }}>
                {/* Compute Type */}
                <div style={{
                  background: 'var(--surface2)',
                  border: `1px solid ${infra.is_serverless === true ? 'rgba(179,136,255,0.3)' : (infra.is_serverless === false ? 'rgba(0,212,255,0.3)' : 'var(--border)')}`,
                  borderRadius: 8, padding: 8, textAlign: 'center'
                }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Compute Type</div>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: infra.is_serverless === true ? '#b388ff' : (infra.is_serverless === false ? '#00d4ff' : '#8892a4')
                  }}>
                    {infra.is_serverless === true ? '⚡ Serverless' : (infra.is_serverless === false ? '🖥️ Classic' : '❓ N/A')}
                  </div>
                </div>

                {/* Driver Node */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Driver Node</div>
                  {infra.is_serverless === true ? (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#b388ff' }}>Managed by Databricks</div>
                  ) : (infra.is_serverless === false ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{infra.driver_node_type || '—'}</div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>N/A</div>
                  ))}
                </div>

                {/* Worker Node */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Worker Node</div>
                  {infra.is_serverless === true ? (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#b388ff' }}>Auto-scaled</div>
                  ) : (infra.is_serverless === false ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>
                      {infra.worker_node_type || '—'} &times; {dltWorkerStr}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>N/A</div>
                  ))}
                </div>

                {/* DBR Version */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>DBR Version</div>
                  {infra.is_serverless === true ? (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#b388ff' }}>Serverless Runtime</div>
                  ) : (infra.is_serverless === false ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>{infra.dbr_version || '—'}</div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>N/A</div>
                  ))}
                </div>

                {/* Photon */}
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8892a4', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Photon</div>
                  {infra.is_serverless === true ? (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#00ff88' }}>Always On ✅</div>
                  ) : (infra.is_serverless === false ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: infra.photon_enabled ? '#00ff88' : '#ff3366' }}>
                      {infra.photon_enabled ? 'Enabled ✅' : 'Disabled'}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>N/A</div>
                  ))}
                </div>
              </div>

              <hr style={{ borderColor: 'var(--border)', margin: '20px 0' }} />

              {/* Signals */}
              {signals.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ marginBottom: 12, color: 'var(--text-hi)' }}>⚠️ Detected Signals</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {signals.slice(0, 20).map((s, i) => {
                      const sev = s.severity || 'INFO'
                      const color = SEV_COLOUR[sev] || '#888'
                      return (
                        <div key={i} style={{ borderLeft: `4px solid ${color}`, padding: '6px 12px', background: 'var(--surface2)', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color, fontWeight: 'bold', fontSize: 11 }}>{sev}</span>
                          <span style={{ color: 'var(--text-hi)', fontSize: 13, flex: 1 }}>{s.message}</span>
                          <span style={{ color: 'var(--text-mid)', fontSize: 11 }}>· {s.source} {s.count > 1 ? `· ×${s.count}` : ''}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* AI Recommendations */}
              <div style={{ marginBottom: 24 }}>
                <h4 style={{ marginBottom: 12, color: 'var(--text-hi)' }}>🤖 AI Recommendations</h4>
                {(() => {
                  const isError = aiResult && (
                    typeof aiResult === 'string' ||
                    aiResult.error ||
                    (!aiResult.summary && !aiResult.recommendations)
                  )
                  const errorMsg = aiResult
                    ? (typeof aiResult === 'string'
                        ? aiResult
                        : aiResult.error || 'AI service returned an unexpected response. Please try again.')
                    : null

                  return (
                    <>
                      {/* Error state */}
                      {isError && (
                        <div style={{
                          background: 'rgba(220, 38, 38, 0.08)',
                          border: '1px solid var(--border)',
                          borderLeft: '4px solid var(--red)',
                          borderRadius: 6,
                          padding: '14px 18px',
                          marginBottom: 16,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12
                        }}>
                          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ color: 'var(--red)', fontWeight: 700, fontSize: 13, margin: '0 0 4px 0' }}>AI Service Error</p>
                            <p style={{ color: 'var(--text-hi)', fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word', margin: 0 }}>{errorMsg}</p>
                          </div>
                        </div>
                      )}

                      {/* No result yet */}
                      {!aiResult && !generatingAi && (
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, textAlign: 'center' }}>
                          <p style={{ color: 'var(--text-lo)', marginBottom: 12, fontSize: 13 }}>Preprocessed summary data is compiled. Click below to analyze via LLM.</p>
                        </div>
                      )}

                      {/* Successful result */}
                      {!isError && aiResult && (
                        <div>
                          {aiResult.summary && (
                            <div style={{
                              background: 'var(--surface2)',
                              borderLeft: '4px solid var(--purple)',
                              padding: '12px 16px',
                              borderRadius: 6,
                              marginBottom: 16,
                              color: 'var(--text-hi)',
                              lineHeight: 1.5,
                              fontSize: 13
                            }}>
                              {aiResult.summary}
                            </div>
                          )}

                          {aiResult.recommendations?.map((rec, idx) => {
                            const priority = rec.priority || 'MEDIUM'
                            const color = SEV_COLOUR[priority] || '#888'
                            const icon = DIM_ICON[rec.dimension] || '🔧'
                            return (
                              <div key={idx} style={{
                                background: 'var(--surface2)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                marginBottom: 12,
                                padding: 16
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                                  <strong style={{ fontSize: 14, color: 'var(--text-hi)' }}>{icon} {rec.title || rec.dimension}</strong>
                                  <span style={{ color, fontWeight: 'bold', fontSize: 11 }}>{priority}</span>
                                </div>
                                <div style={{ fontSize: 13, marginBottom: 8 }}>
                                  <strong style={{ color: 'var(--text-hi)' }}>Finding:</strong> <span style={{ color: 'var(--text-hi)' }}>{rec.finding}</span>
                                </div>
                                <div style={{ fontSize: 13, marginBottom: 8 }}>
                                  <strong style={{ color: 'var(--text-hi)' }}>Recommendation:</strong> <span style={{ color: 'var(--text-hi)' }}>{rec.recommendation}</span>
                                </div>
                                {rec.expected_impact && (
                                  <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>
                                    <strong>Expected Impact:</strong> {rec.expected_impact}
                                  </div>
                                )}
                                {rec.code_or_config && (
                                  <pre style={{
                                    background: 'var(--bg2)',
                                    padding: 10,
                                    borderRadius: 4,
                                    overflowX: 'auto',
                                    border: '1px solid var(--border)',
                                    fontSize: 12,
                                    color: 'var(--text-hi)',
                                    fontFamily: 'var(--font-mono)'
                                  }}>
                                    <code>{rec.code_or_config}</code>
                                  </pre>
                                )}
                              </div>
                            )
                          })}

                          <details style={{
                            marginTop: 20,
                            background: 'var(--surface2)',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: '12px'
                          }}>
                            <summary style={{
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: 13,
                              color: 'var(--cyan)',
                              outline: 'none',
                              userSelect: 'none'
                            }}>
                              🔬 Raw RunIntelligenceSummary (JSON)
                            </summary>
                            <pre style={{
                              marginTop: 12,
                              background: 'var(--bg2)',
                              padding: 12,
                              borderRadius: 4,
                              overflowX: 'auto',
                              border: '1px solid var(--border)',
                              fontSize: 11,
                              color: 'var(--green)',
                              fontFamily: 'var(--font-mono)',
                              maxHeight: '400px'
                            }}>
                              <code>{JSON.stringify(analysisResult, null, 2)}</code>
                            </pre>
                          </details>
                        </div>
                      )}

                      {/* Generate / Regenerate button */}
                      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button
                          onClick={handleGenerateAi}
                          disabled={generatingAi}
                          style={{
                            background: isError ? '#ff3366' : '#a78bfa',
                            color: '#ffffff',
                            border: 'none',
                            fontWeight: 'bold',
                            padding: '9px 20px',
                            borderRadius: 6,
                            cursor: generatingAi ? 'not-allowed' : 'pointer',
                            opacity: generatingAi ? 0.7 : 1,
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            transition: 'opacity 0.2s'
                          }}
                        >
                          {generatingAi
                            ? '⏳ Analyzing Workload…'
                            : isError
                              ? '🔄 Retry AI Recommendations'
                              : aiResult
                                ? '🔄 Regenerate Recommendations'
                                : '🤖 Generate AI Recommendations'
                          }
                        </button>
                        {generatingAi && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Calling LLM, this may take a moment…</span>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>

              {/* Data Quality */}
              {dq.expectations?.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ marginBottom: 12, color: 'var(--text-hi)' }}>🛡️ Data Quality Expectations</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Dataset</th>
                          <th>Constraint</th>
                          <th>Passed</th>
                          <th>Failed</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dq.expectations.map((exp, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 'bold' }}>{exp.dataset || '—'}</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{exp.constraint || '—'}</td>
                            <td>{exp.passed_records?.toLocaleString() || 0}</td>
                            <td style={{ color: Number(exp.failed_records) > 0 ? 'var(--red)' : 'var(--text-hi)' }}>{exp.failed_records?.toLocaleString() || 0}</td>
                            <td>{exp.status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Setup tab */
        <div className="dashboard-panel" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 12, color: 'var(--text-hi)' }}>⚙️ Setup &amp; Config</h3>
          <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 16 }}>
            The Run Intelligence Engine analyzes your driver log files and cluster events in near real-time. Follow the steps below to configure your jobs.
          </div>

          <h4 style={{ marginBottom: 8, marginTop: 24, color: 'var(--text-hi)' }}>📋 One-Time Setup SQL</h4>
          <pre style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
            <code style={{ color: 'var(--text-hi)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{`CREATE CATALOG IF NOT EXISTS finops;
CREATE SCHEMA IF NOT EXISTS finops.monitoring;
-- Create UC Volume to capture job driver logs
CREATE VOLUME IF NOT EXISTS finops.monitoring.rie_driver_logs;`}</code>
          </pre>

          <h4 style={{ marginBottom: 8, marginTop: 24, color: 'var(--text-hi)' }}>📄 Job Cluster Config Snippet</h4>
          <pre style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: 12, borderRadius: 4, overflowX: 'auto' }}>
            <code style={{ color: 'var(--text-hi)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>{`{
  "new_cluster": {
    "spark_env_vars": {
      "RIE_DRIVER_LOGS_VOLUME": "/Volumes/finops/monitoring/rie_driver_logs"
    },
    "init_scripts": [
      {
        "workspace": {
          "destination": "/Shared/finops/auto_log_capture.sh"
        }
      }
    ]
  }
`}</code>
          </pre>

          <h4 style={{ marginBottom: 8, marginTop: 24, color: 'var(--text-hi)' }}>📁 Init Script Location</h4>
          <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.2)', padding: 12, borderRadius: 6, color: '#00d4ff', fontSize: 12 }}>
            ℹ️ Upload the script located at <code>scripts/databricks/auto_log_capture.sh</code> to your Databricks workspace path <code>/Shared/finops/auto_log_capture.sh</code>.
          </div>
        </div>
      )}
    </div>
  )
}
