import { useState, useEffect } from 'react'
import { lookup as api, overall } from '../api/index'
import MetricCard from '../components/kpi/MetricCard'
import PlotlyChart from '../components/charts/PlotlyChart'

const LOOKUP_TYPES = {
  '🔧 Job': 'job',
  '🔀 DLT Pipeline': 'pipeline',
  '🖥️ Cluster': 'cluster',
  '🏭 Warehouse': 'warehouse',
  '👤 User': 'user',
  '📓 Notebook': 'notebook'
}

const LOOKUP_TIPS = {
  job: 'searching "etl" will match "billing_etl", "silver_etl", etc.',
  pipeline: 'searching "etl" will match "billing_etl_pipeline", etc.',
  cluster: 'searching "dev" will match "dev_cluster_1", etc.',
  warehouse: 'searching "sql" will match "sql_warehouse_1", etc.',
  user: 'searching "john" will match "john.doe@company.com", etc.',
  notebook: 'searching "analysis" will match "/Shared/analysis_notebook", etc.'
}

const DATE_OPTIONS = {
  'Last 7 days': 7,
  'Last 14 days': 14,
  'Last 30 days': 30,
  'Last 60 days': 60,
  'Last 90 days': 90,
  'Last 180 days': 180,
  'Last 365 days': 365
}

const fmt = n => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function CostLookup() {
  const [type, setType] = useState('job')
  const [search, setSearch] = useState('')
  const [days, setDays] = useState(30)
  
  // Workspace selection states
  const [workspacesList, setWorkspacesList] = useState([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [workspaceSearchMode, setWorkspaceSearchMode] = useState('dropdown') // 'dropdown' | 'manual'
  const [wsSearchInput, setWsSearchInput] = useState('')
  const [wsSearchType, setWsSearchType] = useState('name') // 'name' | 'id'
  const [wsMatches, setWsMatches] = useState([])
  const [wsResolvedName, setWsResolvedName] = useState('')
  const [wsError, setWsError] = useState('')
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)

  // Refined Wizard states (Name vs ID)
  const [searchMode, setSearchMode] = useState('id') // 'id' | 'name'
  const [matchedEntities, setMatchedEntities] = useState([]) // resolved matches from Name search
  const [selectedEntityId, setSelectedEntityId] = useState('') // chosen from matches dropdown
  const [loadingMatches, setLoadingMatches] = useState(false)
  const [matchError, setMatchError] = useState('')

  // Resource lookup states
  const [results, setResults] = useState(null)
  const [selectedResource, setSelectedResource] = useState(null) // confirmed resource row
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  // Load workspaces on mount
  useEffect(() => {
    handleRefreshWorkspaces()
  }, [])

  // Reset selected resource and wizard state on type change
  const handleTypeChange = (newType) => {
    setType(newType)
    setSearch('')
    setResults(null)
    setSelectedResource(null)
    setMatchedEntities([])
    setSelectedEntityId('')
    setSearchMode('id')
    setMatchError('')
  }

  // Workspace resolver (Manual search)
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

  // Step 1: Find Matching Entities (For Name Mode)
  const handleFindMatches = async () => {
    setMatchError('')
    setMatchedEntities([])
    setSelectedEntityId('')
    setResults(null)
    setSelectedResource(null)

    const query = search.trim()
    if (!query) {
      setMatchError('Please enter a name keyword to search.')
      return
    }

    setLoadingMatches(true)
    try {
      const wsParam = selectedWorkspaceId || null
      let res
      if (type === 'job') res = await api.job(query, 30, wsParam)
      else if (type === 'pipeline') res = await api.pipeline(query, 30, wsParam)
      else if (type === 'cluster') res = await api.cluster(query, 30, wsParam)
      else if (type === 'warehouse') res = await api.warehouse(query, 30, wsParam)
      
      const entities = res?.summary || []
      if (entities.length === 0) {
        setMatchError(`No matching ${type}s found containing "${query}".`)
      } else {
        setMatchedEntities(entities)
      }
    } catch (err) {
      setMatchError('Failed to fetch matching resources.')
      console.error(err)
    } finally {
      setLoadingMatches(false)
    }
  }

  // Step 2: Run Cost Diagnostics
  const handleSearch = async (forcedId = null) => {
    const termToQuery = forcedId || (searchMode === 'id' ? search.trim() : selectedEntityId)
    if (!termToQuery) {
      setError('Please provide a search target.')
      return
    }

    setError('')
    setResults(null)
    setSelectedResource(null)
    setLoading(true)
    
    try {
      let res
      const wsParam = selectedWorkspaceId || null
      
      if (type === 'job') res = await api.job(termToQuery, days, wsParam)
      else if (type === 'pipeline') res = await api.pipeline(termToQuery, days, wsParam)
      else if (type === 'cluster') res = await api.cluster(termToQuery, days, wsParam)
      else if (type === 'warehouse') res = await api.warehouse(termToQuery, days, wsParam)
      else if (type === 'user') res = await api.user(termToQuery, days, wsParam)
      else if (type === 'notebook') res = await api.notebook(termToQuery, days, wsParam)
      
      setResults(res)

      // Automatically select and render the resource directly (skipping any confirmation lists)
      if (res) {
        if (type === 'notebook') {
          // Notebooks are grouped by ID since summary list doesn't exist
          const detail = res.detail || []
          if (detail.length > 0) {
            const firstId = detail[0].notebook_id
            setSelectedResource({
              notebook_id: firstId,
              notebook_name: detail[0].notebook_name || firstId,
              team: detail[0].team || 'untagged'
            })
          }
        } else if (res.summary && res.summary.length > 0) {
          // Find the exact entity in summary list or default to the first one
          const match = res.summary.find(s => 
            String(s.job_id || s.pipeline_id || s.cluster_id || s.warehouse_id || s.user_name || '').toLowerCase() === termToQuery.toLowerCase()
          )
          setSelectedResource(match || res.summary[0])
        } else {
          setError(`No diagnostics records found for ID "${termToQuery}".`)
        }
      }
    } catch (err) {
      setError('An error occurred while fetching cost diagnostics.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      if (searchMode === 'id' || type === 'user' || type === 'notebook') {
        handleSearch()
      } else {
        handleFindMatches()
      }
    }
  }

  // Cost & Daily Trend details rendering
  const renderJobDetails = () => {
    const row = selectedResource
    const { detail = [] } = results || {}

    const jobDetails = detail.filter(r => r.job_id === row.job_id)
    const dailyMap = {}
    jobDetails.forEach(r => {
      const d = r.usage_date
      if (!dailyMap[d]) dailyMap[d] = { usage_date: d, cost_usd: 0, dbus: 0, run_count: 0 }
      dailyMap[d].cost_usd += Number(r.cost_usd || 0)
      dailyMap[d].dbus += Number(r.dbus || 0)
      dailyMap[d].run_count += Number(r.run_count || 0)
    })
    const daily = Object.values(dailyMap).sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.cost_usd),
      marker: { color: '#00d4ff' },
      hovertemplate: '%{x}<br>$%{y:.2f}<extra></extra>'
    }]

    const dbuTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.dbus),
      marker: { color: '#b388ff' },
      hovertemplate: '%{x}<br>%{y:.2f} DBUs<extra></extra>'
    }]

    const tc = Number(row.total_cost_usd || 0)
    const costAccent = tc > 500 ? '#ff3366' : '#00d4ff'
    const teamAccent = row.team === 'untagged' ? '#ffaa00' : '#00ff88'

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          🔧 Job: {row.job_name || row.job_id} <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 'normal' }}>({row.job_id})</span>
        </h3>
        <div className="kpi-row" style={{ marginTop: 12 }}>
          <MetricCard id="job-detail-cost" label="TOTAL COST" value={`$${fmt(tc)}`} accent={costAccent} sub={`Last ${days} days`} />
          <MetricCard id="job-detail-dbus" label="TOTAL DBUs" value={fmt(row.total_dbus)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="job-detail-runs" label="TOTAL RUNS" value={fmt(row.total_runs)} accent="#00ff88" sub={`${row.active_days} active days`} />
          <MetricCard id="job-detail-avg" label="AVG COST/RUN" value={`$${Number(row.avg_cost_per_run || 0).toFixed(4)}`} accent="#ffaa00" sub="Per execution" />
          <MetricCard id="job-detail-team" label="TEAM" value={row.team} accent={teamAccent} sub={`Job ID: ${row.job_id}`} />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="job-chart-cost" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={dbuTrace} id="job-chart-dbu" layout={{ title: 'Daily DBUs', xaxis: { type: 'category' } }} />
          </div>
        </div>

        <div className="dashboard-panel" style={{ marginTop: 16 }}>
          <div className="section-label">Daily Breakdown</div>
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cost (USD)</th>
                  <th>DBUs</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold' }}>{r.usage_date}</td>
                    <td>${r.cost_usd.toFixed(4)}</td>
                    <td>{r.dbus.toFixed(2)}</td>
                    <td>{r.run_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const renderPipelineDetails = () => {
    const row = selectedResource
    const { detail = [] } = results || {}

    const pipeDetails = detail.filter(r => r.pipeline_id === row.pipeline_id)
    const dailyMap = {}
    pipeDetails.forEach(r => {
      const d = r.usage_date
      if (!dailyMap[d]) dailyMap[d] = { usage_date: d, cost_usd: 0, dbus: 0 }
      dailyMap[d].cost_usd += Number(r.cost_usd || 0)
      dailyMap[d].dbus += Number(r.dbus || 0)
    })
    const daily = Object.values(dailyMap).sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.cost_usd),
      marker: { color: '#b388ff' },
      hovertemplate: '%{x}<br>$%{y:.4f}<extra></extra>'
    }]

    const dbuTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.dbus),
      marker: { color: '#00ff88' },
      hovertemplate: '%{x}<br>%{y:.2f} DBUs<extra></extra>'
    }]

    const tc = Number(row.total_cost_usd || 0)
    const costAccent = tc > 500 ? '#ff3366' : '#00d4ff'
    const teamAccent = row.team === 'untagged' ? '#ffaa00' : '#00ff88'

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          🔀 Pipeline: {row.pipeline_name || row.pipeline_id} <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 'normal' }}>({row.pipeline_id})</span>
        </h3>
        <div className="kpi-row" style={{ marginTop: 12 }}>
          <MetricCard id="pipe-detail-cost" label="TOTAL COST" value={`$${fmt(tc)}`} accent={costAccent} sub={`Last ${days} days`} />
          <MetricCard id="pipe-detail-dbus" label="TOTAL DBUs" value={fmt(row.total_dbus)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="pipe-detail-runs" label="ACTIVE DAYS" value={fmt(row.active_days)} accent="#00ff88" sub={`${row.first_seen} → ${row.last_seen}`} />
          <MetricCard id="pipe-detail-team" label="TEAM" value={row.team} accent={teamAccent} sub={`Pipeline ID: ${row.pipeline_id}`} />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="pipe-chart-cost" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={dbuTrace} id="pipe-chart-dbu" layout={{ title: 'Daily DBUs', xaxis: { type: 'category' } }} />
          </div>
        </div>

        <div className="dashboard-panel" style={{ marginTop: 16 }}>
          <div className="section-label">Daily Breakdown</div>
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cost (USD)</th>
                  <th>DBUs</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold' }}>{r.usage_date}</td>
                    <td>${r.cost_usd.toFixed(4)}</td>
                    <td>{r.dbus.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const renderClusterDetails = () => {
    const row = selectedResource
    const { detail = [] } = results || {}

    const clusterDetails = detail.filter(r => r.cluster_id === row.cluster_id)
    const dailyMap = {}
    clusterDetails.forEach(r => {
      const d = r.usage_date
      if (!dailyMap[d]) dailyMap[d] = { usage_date: d, cost_usd: 0, dbus: 0 }
      dailyMap[d].cost_usd += Number(r.cost_usd || 0)
      dailyMap[d].dbus += Number(r.dbus || 0)
    })
    const daily = Object.values(dailyMap).sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.cost_usd),
      marker: { color: '#ffaa00' },
      hovertemplate: '%{x}<br>$%{y:.4f}<extra></extra>'
    }]

    const dbuTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.dbus),
      marker: { color: '#b388ff' },
      hovertemplate: '%{x}<br>%{y:.2f} DBUs<extra></extra>'
    }]

    const tc = Number(row.total_cost_usd || 0)
    const costAccent = tc > 1000 ? '#ff3366' : '#00d4ff'
    const teamAccent = row.team === 'untagged' ? '#ffaa00' : '#00ff88'

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          🖥️ Cluster: {row.cluster_name || row.cluster_id} <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 'normal' }}>({row.cluster_id})</span>
        </h3>
        <div className="kpi-row" style={{ marginTop: 12 }}>
          <MetricCard id="cluster-detail-cost" label="TOTAL COST" value={`$${fmt(tc)}`} accent={costAccent} sub={`Last ${days} days`} />
          <MetricCard id="cluster-detail-dbus" label="TOTAL DBUs" value={fmt(row.total_dbus)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="cluster-detail-prod" label="PRODUCT" value={row.product || 'INTERACTIVE'} accent="#00d4ff" sub="Product Type" />
          <MetricCard id="cluster-detail-runs" label="ACTIVE DAYS" value={fmt(row.active_days)} accent="#00ff88" sub={`${row.first_seen} → ${row.last_seen}`} />
          <MetricCard id="cluster-detail-team" label="TEAM" value={row.team} accent={teamAccent} sub={`Cluster: ${row.cluster_id}`} />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="cluster-chart-cost" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={dbuTrace} id="cluster-chart-dbu" layout={{ title: 'Daily DBUs', xaxis: { type: 'category' } }} />
          </div>
        </div>

        <div className="dashboard-panel" style={{ marginTop: 16 }}>
          <div className="section-label">Daily Breakdown</div>
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cost (USD)</th>
                  <th>DBUs</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold' }}>{r.usage_date}</td>
                    <td>${r.cost_usd.toFixed(4)}</td>
                    <td>{r.dbus.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const renderWarehouseDetails = () => {
    const row = selectedResource
    const { cost_detail = [], stats = [] } = results || {}
    
    const whCostDetail = cost_detail.filter(r => r.warehouse_id === row.warehouse_id)
    const whStats = stats.filter(r => r.warehouse_id === row.warehouse_id)

    const totalCost = Number(row.total_cost_usd || 0)
    const totalDbus = Number(row.total_dbus || 0)

    const totalQueries = whStats.reduce((sum, r) => sum + Number(r.query_count || 0), 0)
    const totalGb = whStats.reduce((sum, r) => sum + Number(r.total_gb_scanned || 0), 0)
    const totalCached = whStats.reduce((sum, r) => sum + Number(r.cached_queries || 0), 0)
    const cachePct = totalQueries ? (100 * totalCached / totalQueries).toFixed(1) : '0.0'

    const sortedCostDetail = [...whCostDetail].sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: sortedCostDetail.map(r => r.usage_date),
      y: sortedCostDetail.map(r => r.cost_usd),
      marker: { color: '#00d4ff' },
      hovertemplate: '%{x}<br>$%{y:.4f}<extra></extra>'
    }]

    const dbuTrace = [{
      type: 'bar',
      x: sortedCostDetail.map(r => r.usage_date),
      y: sortedCostDetail.map(r => r.dbus),
      marker: { color: '#ffaa00' },
      hovertemplate: '%{x}<br>%{y:.2f} DBUs<extra></extra>'
    }]

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          🏭 Warehouse: {row.warehouse_name || row.warehouse_id} <span style={{ fontSize: 13, color: '#8892a4', fontWeight: 'normal' }}>({row.warehouse_id})</span>
        </h3>
        <div className="kpi-row">
          <MetricCard id="wh-detail-cost" label="TOTAL COST" value={`$${fmt(totalCost)}`} accent={totalCost > 500 ? '#ff3366' : '#00d4ff'} sub={`Last ${days} days`} />
          <MetricCard id="wh-detail-dbus" label="TOTAL DBUs" value={fmt(totalDbus)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="wh-detail-queries" label="TOTAL QUERIES" value={fmt(totalQueries)} accent="#00ff88" sub={`Last ${days} days`} />
          <MetricCard id="wh-detail-gb" label="TOTAL GB SCANNED" value={fmt(totalGb) + " GB"} accent="#ffaa00" sub="Cloud storage read" />
          <MetricCard id="wh-detail-cache" label="CACHE HIT %" value={cachePct + "%"} accent={Number(cachePct) >= 60 ? '#00ff88' : '#ff3366'} sub="Target: 60%+" />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="wh-detail-cost-chart" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={dbuTrace} id="wh-detail-dbu-chart" layout={{ title: 'Daily DBUs', xaxis: { type: 'category' } }} />
          </div>
        </div>

        {whStats.length > 0 && (
          <div className="dashboard-panel" style={{ marginTop: 16 }}>
            <div className="section-label">Daily Query Statistics</div>
            <div style={{ overflowX: 'auto', maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Queries</th>
                    <th>GB Scanned</th>
                    <th>Avg Duration</th>
                    <th>Max Duration</th>
                    <th>Failed</th>
                    <th>Cached</th>
                  </tr>
                </thead>
                <tbody>
                  {whStats.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold' }}>{r.query_date}</td>
                      <td>{r.query_count}</td>
                      <td>{Number(r.total_gb_scanned).toFixed(2)} GB</td>
                      <td>{r.avg_duration_s}s</td>
                      <td>{r.max_duration_s}s</td>
                      <td style={{ color: Number(r.failed_queries) > 0 ? 'var(--red)' : 'var(--text-hi)' }}>{r.failed_queries}</td>
                      <td>{r.cached_queries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderUserDetails = () => {
    const row = selectedResource
    const { cost_detail = [], stats = [] } = results || {}

    const uName = row.user_name
    const uCostDetail = cost_detail.filter(r => r.user_name?.toLowerCase() === uName?.toLowerCase())
    const uStats = stats.filter(r => r.user_name?.toLowerCase() === uName?.toLowerCase())

    const totalCost = Number(row.total_cost_usd || 0)
    const totalDbus = Number(row.total_dbus || 0)

    const totalQueries = uStats.reduce((sum, r) => sum + Number(r.query_count || 0), 0)
    const totalGb = uStats.reduce((sum, r) => sum + Number(r.total_gb_scanned || 0), 0)
    const avgCache = uStats.length ? (uStats.reduce((sum, r) => sum + Number(r.cache_pct || 0), 0) / uStats.length).toFixed(1) : '0.0'

    const dailyMap = {}
    uCostDetail.forEach(r => {
      const d = r.usage_date
      if (!dailyMap[d]) dailyMap[d] = { usage_date: d, cost_usd: 0, dbus: 0 }
      dailyMap[d].cost_usd += Number(r.cost_usd || 0)
      dailyMap[d].dbus += Number(r.dbus || 0)
    })
    const daily = Object.values(dailyMap).sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.cost_usd),
      marker: { color: '#b388ff' },
      hovertemplate: '%{x}<br>$%{y:.4f}<extra></extra>'
    }]

    const sortedStats = [...uStats].sort((a, b) => a.query_date.localeCompare(b.query_date))

    const cacheTrace = [{
      type: 'scatter',
      mode: 'lines+markers',
      x: sortedStats.map(r => r.query_date),
      y: sortedStats.map(r => r.cache_pct),
      line: { color: '#00ff88', width: 2 },
      marker: { size: 5 },
      hovertemplate: '%{x}<br>Cache Hit: %{y:.1f}%<extra></extra>'
    }]

    const cacheLayout = {
      yaxis: { range: [0, 100], ticksuffix: '%' },
      shapes: sortedStats.length ? [{
        type: 'line',
        x0: sortedStats[0].query_date,
        y0: 60,
        x1: sortedStats[sortedStats.length - 1].query_date,
        y1: 60,
        line: { color: '#ffaa00', width: 1, dash: 'dash' }
      }] : []
    }

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          👤 User: {uName}
        </h3>
        <div className="kpi-row">
          <MetricCard id="user-detail-cost" label="TOTAL COST" value={`$${fmt(totalCost)}`} accent="#00d4ff" sub={`Last ${days} days`} />
          <MetricCard id="user-detail-dbus" label="TOTAL DBUs" value={fmt(totalDbus)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="user-detail-queries" label="TOTAL QUERIES" value={fmt(totalQueries)} accent="#00ff88" sub="On SQL Warehouses" />
          <MetricCard id="user-detail-gb" label="TOTAL GB SCANNED" value={fmt(totalGb) + " GB"} accent="#ffaa00" sub="Cloud storage read" />
          <MetricCard id="user-detail-cache" label="AVG CACHE HIT %" value={avgCache + "%"} accent={Number(avgCache) >= 60 ? '#00ff88' : '#ff3366'} sub="Target: 60%+" />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="user-detail-cost-chart" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={cacheTrace} id="user-detail-cache-chart" layout={{ ...cacheLayout, title: 'Daily Cache Hit %' }} />
          </div>
        </div>

        {uStats.length > 0 && (
          <div className="dashboard-panel" style={{ marginTop: 16 }}>
            <div className="section-label">Daily Query Statistics</div>
            <div style={{ overflowX: 'auto', maxHeight: 300 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Queries</th>
                    <th>GB Scanned</th>
                    <th>Avg Duration</th>
                    <th>Cache %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...uStats].reverse().map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 'bold' }}>{r.query_date}</td>
                      <td>{r.query_count}</td>
                      <td>{Number(r.total_gb_scanned).toFixed(2)} GB</td>
                      <td>{r.avg_duration_s}s</td>
                      <td style={{ color: Number(r.cache_pct) < 60 ? 'var(--amber)' : 'var(--text-hi)' }}>{Number(r.cache_pct).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderNotebookDetails = () => {
    const row = selectedResource
    const { detail = [] } = results || {}

    const nbDetails = detail.filter(r => r.notebook_id === row.notebook_id)
    const totalCost = nbDetails.reduce((sum, r) => sum + Number(r.cost_usd || 0), 0)
    const totalDbus = nbDetails.reduce((sum, r) => sum + Number(r.dbus || 0), 0)

    const daily = [...nbDetails].sort((a, b) => a.usage_date.localeCompare(b.usage_date))

    const costTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.cost_usd),
      marker: { color: '#00d4ff' },
      hovertemplate: '%{x}<br>$%{y:.4f}<extra></extra>'
    }]

    const dbuTrace = [{
      type: 'bar',
      x: daily.map(r => r.usage_date),
      y: daily.map(r => r.dbus),
      marker: { color: '#b388ff' },
      hovertemplate: '%{x}<br>%{y:.2f} DBUs<extra></extra>'
    }]

    return (
      <div className="lookup-result-item" style={{ marginTop: 16 }}>
        <h3 style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8, color: 'var(--text-hi)' }}>
          📓 Notebook: {row.notebook_name || row.notebook_id}
        </h3>
        <div className="kpi-row">
          <MetricCard id="nb-detail-cost" label="TOTAL COST" value={`$${totalCost.toFixed(4)}`} accent="#ff3366" sub={`Last ${days} days`} />
          <MetricCard id="nb-detail-dbus" label="TOTAL DBUs" value={totalDbus.toFixed(2)} accent="#b388ff" sub="DBUs consumed" />
          <MetricCard id="nb-detail-days" label="ACTIVE DAYS" value={fmt(nbDetails.length)} accent="#00ff88" sub={`Out of last ${days}`} />
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={costTrace} id="nb-detail-cost-chart" layout={{ title: 'Daily Cost (USD)', xaxis: { type: 'category' } }} />
          </div>
          <div className="dashboard-panel" style={{ margin: 0 }}>
            <PlotlyChart data={dbuTrace} id="nb-detail-dbu-chart" layout={{ title: 'Daily DBUs', xaxis: { type: 'category' } }} />
          </div>
        </div>

        <div className="dashboard-panel" style={{ marginTop: 16 }}>
          <div className="section-label">Daily Cost breakdown</div>
          <div style={{ overflowX: 'auto', maxHeight: 300 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Cost (USD)</th>
                  <th>DBUs</th>
                </tr>
              </thead>
              <tbody>
                {[...daily].reverse().map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 'bold' }}>{r.usage_date}</td>
                    <td>{r.billing_origin_product}</td>
                    <td>${Number(r.cost_usd).toFixed(4)}</td>
                    <td>{Number(r.dbus).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  // Check if type supports ID vs Name toggle
  const showToggleMode = ['job', 'pipeline', 'cluster', 'warehouse'].includes(type)

  return (
    <div>
      {/* Page Header */}
      <div className="dashboard-panel" style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '20px 24px',
        marginBottom: 20
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-hi)' }}>
          🔎 Cost &amp; DBU Lookup Toolkit
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8892a4', marginTop: 6 }}>
          Find the exact cost and DBU consumption of any resource — job, pipeline, cluster, warehouse, user, or notebook.
          System tables retain <b style={{ color: '#00d4ff' }}>up to 1 year</b> of history.
        </div>
      </div>

      {/* Workspace Selector Bar */}
      <div className="dashboard-panel" style={{ padding: 16, marginBottom: 16, border: '1px solid var(--border)' }}>
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
                  name="wsSearchType" 
                  value="name" 
                  checked={wsSearchType === 'name'} 
                  onChange={() => setWsSearchType('name')}
                />
                <span>Workspace Name</span>
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)', cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="wsSearchType" 
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
                  Selected Workspace: <strong>{wsResolvedName}</strong>
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

      {/* Main Search Controls */}
      <div className="dashboard-panel" style={{ padding: 16, marginBottom: 16 }}>
        <div className="grid-4-equal" style={{ gap: 12, alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Resource Type</label>
            <select
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
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
              {Object.entries(LOOKUP_TYPES).map(([label, val]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {showToggleMode ? (
            <div>
              <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Identify Mode</label>
              <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 4, padding: 2, height: 38, border: '1px solid var(--border)' }}>
                <button
                  onClick={() => {
                    setSearchMode('id')
                    setMatchedEntities([])
                    setSelectedEntityId('')
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
                    setMatchedEntities([])
                    setSelectedEntityId('')
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
          ) : (
            <div style={{ visibility: 'hidden' }} />
          )}

          <div>
            <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>
              {showToggleMode 
                ? (searchMode === 'id' ? `${type.toUpperCase()} ID or Name` : `${type.toUpperCase()} Name keyword`)
                : (type === 'user' ? 'User email' : 'Notebook path/ID')
              }
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                showToggleMode
                  ? (searchMode === 'id' ? `Enter ${type} ID or name...` : `Enter partial ${type} name`)
                  : (type === 'user' ? 'john.doe@company.com' : '/Shared/analysis')
              }
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
            {showToggleMode && searchMode === 'name' ? (
              <button
                onClick={handleFindMatches}
                disabled={loadingMatches}
                style={{
                  width: '100%',
                  background: '#00d4ff',
                  color: '#0d1220',
                  border: 'none',
                  fontWeight: 'bold',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  height: 38
                }}
              >
                {loadingMatches ? '⏳ Finding…' : '🔍 Find Matches'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{
                    flex: 1,
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-hi)',
                    borderRadius: 4,
                    padding: '8px',
                    height: 38
                  }}
                >
                  {Object.entries(DATE_OPTIONS).map(([label, val]) => (
                    <option key={val} value={val}>{val}d</option>
                  ))}
                </select>
                <button
                  onClick={() => handleSearch()}
                  disabled={loading}
                  style={{
                    flex: 2,
                    background: '#00ff88',
                    color: '#0d1220',
                    border: 'none',
                    fontWeight: 'bold',
                    borderRadius: 4,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    height: 38
                  }}
                >
                  {loading ? '⏳ Loading…' : '🔍 Search'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Resolved dropdown selector for Name Search Mode */}
        {showToggleMode && searchMode === 'name' && matchedEntities.length > 0 && (
          <div style={{ marginTop: 16, background: 'var(--bg2)', padding: 14, borderRadius: 6, border: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>
                Select resolved {type} from matches:
              </label>
              <select
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
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
                <option value="">-- Choose matching {type} --</option>
                {matchedEntities.map(m => {
                  const id = m.job_id || m.pipeline_id || m.cluster_id || m.warehouse_id
                  const name = m.job_name || m.pipeline_name || m.cluster_name || m.warehouse_name || id
                  return (
                    <option key={id} value={id}>
                      {name} ({id}) {m.total_cost_usd ? `· $${fmt(m.total_cost_usd)}` : ''}
                    </option>
                  )
                })}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#8892a4', display: 'block', marginBottom: 4 }}>Date Range</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
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
                {Object.entries(DATE_OPTIONS).map(([label, val]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, alignSelf: 'end' }}>
              <button
                onClick={() => handleSearch(selectedEntityId)}
                disabled={loading || !selectedEntityId}
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
                {loading ? '⏳ Loading…' : '📊 Run Diagnostics'}
              </button>
            </div>
          </div>
        )}

        {matchError && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>⚠️ {matchError}</div>}
        {error && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>⚠️ {error}</div>}
        
        <div style={{ color: '#8892a4', fontSize: 11, marginTop: 8 }}>
          ℹ️ System tables retain up to 365 days of history. Search is case-insensitive.
        </div>
      </div>

      <hr style={{ borderColor: 'var(--border)', margin: '16px 0' }} />

      {/* Results Rendering */}
      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /><span>Searching Databricks System Tables…</span></div>
      ) : selectedResource && results ? (
        <div className="lookup-results-container">
          {type === 'job' && renderJobDetails()}
          {type === 'pipeline' && renderPipelineDetails()}
          {type === 'cluster' && renderClusterDetails()}
          {type === 'warehouse' && renderWarehouseDetails()}
          {type === 'user' && renderUserDetails()}
          {type === 'notebook' && renderNotebookDetails()}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#8892a4',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13
        }}>
          {showToggleMode && searchMode === 'name' && matchedEntities.length > 0 && !selectedEntityId ? (
            <span style={{ color: '#00d4ff' }}>💡 Please select a matching resource from the dropdown and click "Run Diagnostics".</span>
          ) : (
            <>
              Select a workspace context, select a resource type, enter search parameters, and click Search.<br /><br />
              <span style={{ fontSize: 11 }}>💡 Tip: Partial names work — {LOOKUP_TIPS[type]}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
