import { useEffect, useState } from 'react'
import { storage as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { HardDrive, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${Number(n).toFixed(0)}`

export default function StorageTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [kpi, setKpi]     = useState({})
  const [trend, setTrend] = useState([])
  const [tables, setTables]   = useState([])
  const [zombie, setZombie]   = useState([])
  const [vacuum, setVacuum]   = useState([])
  const [retain0, setRetain0] = useState({})
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [k,t,tb,z,v,r0] = await Promise.all([
        api.kpi(workspaceId), api.costTrend(workspaceId), api.tableSizes(workspaceId), api.zombieRisk(workspaceId),
        api.vacuumCompliance(workspaceId), api.retain0Kpi(workspaceId),
      ])
      setKpi(k[0]||{}); setTrend(t); setTables(tb); setZombie(z); setVacuum(v); setRetain0(r0[0]||{})
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('storage')
      await load()
      if (onShowToast) onShowToast("Dashboards are refreshed!")
    } finally {
      setRefreshing(false)
    }
  }

  const handleAnalyze = async () => {
    if (analyze) { setAnalyze(null); return }
    setAnalyzing(true)
    try {
      const highZombie = zombie.filter(r => r.zombie_risk === 'HIGH').length
      const overdue = vacuum.filter(r => (r.days_since_vacuum||0) > 30).length
      const res = await analyzeAPI.detect('storage_health', {
        zombie_risk_high_count: highZombie,
        days_since_vacuum: overdue > 0 ? 31 : 0,
        storage_growth: (kpi.wow_pct_change||0) > 10 ? 1 : 0,
        retain0_violation_count: retain0.violation_count || 0,
      })
      setAnalyze(res)
    } finally { setAnalyzing(false) }
  }

  const getStorageMetrics = () => {
    const highZombie = zombie.filter(r => r.zombie_risk === 'HIGH').length
    const overdue = vacuum.filter(r => (r.days_since_vacuum||0) > 30).length
    return {
      zombie_risk_high_count: highZombie,
      days_since_vacuum: overdue > 0 ? 31 : 0,
      storage_growth: (kpi.wow_pct_change||0) > 10 ? 1 : 0,
      retain0_violation_count: retain0.violation_count || 0,
      critical_tables: overdue
    }
  }

  const trendTrace = [{
    type: 'scatter', mode: 'lines', name: 'Storage Cost',
    x: trend.map(r => r.usage_date),
    y: trend.map(r => r.daily_cost_usd),
    line: { color: '#00ff88' }, fill: 'tozeroy', fillcolor: '#00ff8815',
  }]

  const tableSizeTrace = [{
    type: 'bar', orientation: 'h',
    x: tables.slice(0,12).map(r => r.size_gb),
    y: tables.slice(0,12).map(r => (r.table_name||'?').split('.').pop()),
    marker: { color: tables.slice(0,12).map(r =>
      r.zombie_risk === 'HIGH' ? '#ff3366' :
      r.zombie_risk === 'MEDIUM' ? '#ffaa00' : '#00d4ff'
    )},
  }]

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">Storage Health</div>
          <div className="panel-subtitle">Zombie files · VACUUM compliance · Retain-0 risk · Table growth</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-storage-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze?'active':''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-storage-analyze">
          {analyzing?'':''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-storage-radar"
        >
          Insights
        </button>
        <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '10px', marginLeft: '8px', flexShrink: 0, gap: 6 }}>
          <select
            className="select"
            value={workspaceId || ''}
            onChange={(e) => setWorkspaceId(e.target.value || null)}
            style={{ width: '180px', height: '36px', padding: '6px 12px', margin: 0 }}
          >
            <option value="">All Workspaces</option>
            {workspaces.map(w => (
              <option key={w.workspace_id} value={w.workspace_id}>
                {w.workspace_name || 'Unnamed'} ({w.workspace_id})
              </option>
            ))}
          </select>
          <button
            onClick={onReloadWorkspaces}
            disabled={loadingWorkspaces}
            style={{
              background: 'var(--surface2)',
              color: 'var(--text-hi)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              width: '36px',
              height: '36px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              flexShrink: 0
            }}
            title="Load/Refresh Workspaces"
          >
            {loadingWorkspaces ? '' : ''}
          </button>
        </div>
      </div>

      {loading ? <div className="spinner-wrap"><div className="spinner"/><span>Loading storage data…</span></div> : (
        <>
          <div className="kpi-row">
            <MetricCard id="st-cost" label="Storage Cost (30d)" value={fmt(kpi.total_cost_30d)} accent="#00ff88" info="Total storage cost (DBFS + Delta tables) in last 30 days." />
            <MetricCard id="st-zombie" label="HIGH Zombie Risk" value={zombie.filter(r=>r.zombie_risk==='HIGH').length} accent="#ff3366" sub="tables" info="Count of tables with high volume of unreferenced/stale historical files." />
            <MetricCard id="st-vacuum" label="Overdue VACUUM (>30d)" value={vacuum.filter(r=>(r.days_since_vacuum||0)>30).length} accent="#ffaa00" sub="tables" info="Tables whose last VACUUM operation was more than 30 days ago." />
            <MetricCard id="st-retain0" label="Retain-0 Violations" value={retain0.violation_count ?? '—'} accent="#ff3366" sub="VACUUM RETAIN 0 risk" info="Tables configured with RETAIN 0 HOURS, posing data loss risk if failed/aborted runs occur." />
            <MetricCard id="st-tables" label="Total Tables Tracked" value={tables.length} accent="#4fc3f7" info="Total number of Delta tables tracked in this workspace." />
          </div>

          <div className="grid-2" style={{marginBottom:16}}>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Daily Storage Cost Trend</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily storage cost over time. Look for gradual growth indicating accumulation of stale files.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'storage_cost_area' ? 'active' : ''}`} onClick={() => onRadarClick('storage_cost_area', getStorageMetrics())} title="Analyze Storage Trend"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={trendTrace} id="chart-st-trend"
                layout={{ yaxis:{tickprefix:'$'} }} />
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Largest Tables by Size</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Size breakdown of workspace tables, colored by zombie risk category.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'table_sizes_bar' ? 'active' : ''}`} onClick={() => onRadarClick('table_sizes_bar', getStorageMetrics())} title="Analyze Table Sizes"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={tableSizeTrace} id="chart-st-sizes"
                layout={{ xaxis:{ticksuffix:' GB'}, margin:{l:160,r:60,t:20,b:40} }} />
            </div>
          </div>

          {zombie.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">🧟 Zombie File Risk by Table</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Lists tables with stale/zombie files that need vacuuming, showing file count and days since last VACUUM.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'vacuum_compliance' ? 'active' : ''}`} onClick={() => onRadarClick('vacuum_compliance', getStorageMetrics())} title="Analyze Vacuum Compliance"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <table className="data-table" id="tbl-zombie">
                <thead><tr><th>Table</th><th>Size (GB)</th><th>Files</th><th>Zombie Risk</th><th>Days Since Vacuum</th></tr></thead>
                <tbody>
                  {zombie.slice(0,15).map((r,i) => (
                    <tr key={i}>
                      <td style={{fontFamily:'var(--font-mono)',fontSize:10}}>{r.table_name}</td>
                      <td>{r.size_gb} GB</td>
                      <td>{r.num_files?.toLocaleString()}</td>
                      <td>
                        <span className={`badge badge-${r.zombie_risk==='HIGH'?'critical':r.zombie_risk==='MEDIUM'?'high':'low'}`}>
                          {r.zombie_risk}
                        </span>
                      </td>
                      <td style={{color:(r.days_since_vacuum||0)>30?'var(--red)':'var(--text-hi)'}}>{r.days_since_vacuum}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
