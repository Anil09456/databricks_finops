import { useEffect, useState } from 'react'
import { jobs as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { Wrench, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${Number(n).toFixed(0)}`
const pct = (a,b) => b ? ((a-b)/Math.abs(b))*100 : null

export default function JobsTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [cKpi, setCKpi]     = useState({})
  const [cTop, setCTop]     = useState([])
  const [cDaily, setCDaily] = useState([])
  const [sKpi, setSKpi]     = useState({})
  const [sTop, setSTop]     = useState([])
  const [sDaily, setSDaily] = useState([])
  const [failed, setFailed] = useState([])
  const [weekly, setWeekly] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [ck,ct,cd,sk,st,sd,f,w] = await Promise.all([
        api.classicKpi(workspaceId), api.classicTop(workspaceId), api.classicDaily(workspaceId),
        api.serverlessKpi(workspaceId), api.serverlessTop(workspaceId), api.serverlessDaily(workspaceId),
        api.failedCost(workspaceId), api.weeklyTrend(workspaceId),
      ])
      setCKpi(ck[0]||{}); setCTop(ct); setCDaily(cd)
      setSKpi(sk[0]||{}); setSTop(st); setSDaily(sd)
      setFailed(f); setWeekly(w)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('jobs')
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
      const k = cKpi; const wowPct = pct(k.cost_7d, k.cost_prev_7d) || 0
      const res = await analyzeAPI.detect('jobs_compute', { wow_pct_change: wowPct })
      setAnalyze(res)
    } finally { setAnalyzing(false) }
  }

  const getJobMetrics = () => ({
    wow_pct_change: pct(cKpi.cost_7d, cKpi.cost_prev_7d) || 0,
    cost_trend_pct: weekly.length >= 2 ? (pct(weekly[weekly.length-1].weekly_cost_usd, weekly[weekly.length-2].weekly_cost_usd) || 0) : 0,
  })

  const k = cKpi; const delta = pct(k.cost_7d, k.cost_prev_7d)

  const COLORS = ['#00d4ff','#00ff88','#b388ff','#ffaa00','#ff3366','#4fc3f7']

  const classicBarTrace = [{
    type: 'bar',
    x: cTop.slice(0,10).map(r => r.job_name || r.job_id || '?'),
    y: cTop.slice(0,10).map(r => r.cost_30d_usd),
    marker: { color: '#4fc3f7' },
  }]

  const serverlessBarTrace = [{
    type: 'bar',
    x: sTop.slice(0,10).map(r => r.job_name || r.job_id || '?'),
    y: sTop.slice(0,10).map(r => r.cost_30d_usd),
    marker: { color: '#b388ff' },
  }]

  const failedTrace = [{
    type: 'scatter', mode: 'lines+markers', name: 'Failed Run Cost',
    x: failed.map(r => r.usage_date),
    y: failed.map(r => r.failed_cost_usd),
    line: { color: '#ff3366' }, fill: 'tozeroy', fillcolor: '#ff336615',
    marker: { size: 5, color: '#ff3366' },
  }]

  const weeklyTraces = weekly.length ? [{
    type: 'scatter', mode: 'lines+markers',
    x: weekly.map(r => r.week_start),
    y: weekly.map(r => r.weekly_cost_usd),
    name: 'Weekly Cost', line: { color: '#00d4ff' },
    fill: 'tozeroy', fillcolor: '#00d4ff15',
  }] : []

  const ckpi_wow = pct(cKpi.cost_7d, cKpi.cost_prev_7d) || 0
  const wow_col = ckpi_wow > 20 ? '#ff3366' : (ckpi_wow > 5 ? '#ffaa00' : '#00ff88')

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">Jobs Compute</div>
          <div className="panel-subtitle">Classic Jobs + Serverless Jobs · 30-day view</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-jobs-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze?'active':''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-jobs-analyze">
          {analyzing?'':''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-jobs-radar"
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

      {loading ? <div className="spinner-wrap"><div className="spinner"/><span>Loading jobs data…</span></div> : (
        <>
          <div className="section-label">Classic Jobs</div>
          <div className="kpi-row">
            <MetricCard id="cj-cost-30d" label="30-Day Cost" value={fmt(k.total_cost_30d)} accent="#4fc3f7" info="Total cost for classic job clusters, last 30 days." />
            <MetricCard id="cj-cost-7d" label="Last 7 Days" value={fmt(k.cost_7d)} delta={delta} accent={wow_col} info="Total spend in the last 7 days (and week-over-week cost change)." />
            <MetricCard id="cj-job-count" label="Active Jobs" value={k.job_count ?? '—'} accent="#00ff88" info="Distinct classic job IDs active in last 30 days." />
            <MetricCard id="cj-run-count" label="Total Runs" value={k.run_count ?? '—'} accent="#b388ff" info="Total runs completed in last 30 days." />
          </div>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Top Classic Jobs by Cost</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Top classic job pipelines ranked by 30-day cost.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'classic_jobs_bar' ? 'active' : ''}`} onClick={() => onRadarClick('classic_jobs_bar', getJobMetrics())} title="Analyze Top Classic Jobs"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={classicBarTrace} id="chart-cj-top"
                layout={{ yaxis:{tickprefix:'$'}, xaxis:{tickangle:-30} }} />
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table className="jobs-detail-table">
                  <thead><tr><th>#</th><th>Job ID</th><th>Job Name</th><th>Cost (30d)</th></tr></thead>
                  <tbody>
                    {cTop.slice(0,10).map((r,i) => (
                      <tr key={r.job_id || i}>
                        <td>{i+1}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.job_id || '—'}</td>
                        <td>{r.job_name && r.job_name !== r.job_id ? r.job_name : <em style={{color:'#888'}}>No name</em>}</td>
                        <td style={{ color: '#4fc3f7', fontWeight: 600 }}>{fmt(r.cost_30d_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">8-Week Job Cost Trend</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="8-week rolling job compute cost trend.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'job_8week_trend' ? 'active' : ''}`} onClick={() => onRadarClick('job_8week_trend', getJobMetrics())} title="Analyze Job Cost Trend"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={weeklyTraces} id="chart-job-weekly"
                layout={{ yaxis:{tickprefix:'$'} }} />
            </div>
          </div>

          <hr className="sep" />
          <div className="section-label">Serverless Jobs</div>
          <div className="kpi-row">
            <MetricCard id="sj-cost-30d" label="30-Day Cost" value={fmt(sKpi.total_cost_30d)} accent="#b388ff" info="Total cost for serverless jobs, last 30 days." />
            <MetricCard id="sj-cost-7d" label="Last 7 Days" value={fmt(sKpi.cost_7d)} delta={pct(sKpi.cost_7d,sKpi.cost_prev_7d)} accent="#00d4ff" info="Total serverless jobs spend in the last 7 days (and WoW change)." />
            <MetricCard id="sj-job-count" label="Active Jobs" value={sKpi.job_count ?? '—'} accent="#00ff88" info="Distinct serverless jobs active in last 30 days." />
          </div>
          <div className="grid-2">
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Top Serverless Jobs by Cost</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Top serverless job runs ranked by 30-day cost.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'serverless_jobs_bar' ? 'active' : ''}`} onClick={() => onRadarClick('serverless_jobs_bar', getJobMetrics())} title="Analyze Top Serverless Jobs"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={serverlessBarTrace} id="chart-sj-top"
                layout={{ yaxis:{tickprefix:'$'}, xaxis:{tickangle:-30} }} />
              <div style={{ overflowX: 'auto', marginTop: 8 }}>
                <table className="jobs-detail-table">
                  <thead><tr><th>#</th><th>Job ID</th><th>Job Name</th><th>Cost (30d)</th></tr></thead>
                  <tbody>
                    {sTop.slice(0,10).map((r,i) => (
                      <tr key={r.job_id || i}>
                        <td>{i+1}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.job_id || '—'}</td>
                        <td>{r.job_name && r.job_name !== r.job_id ? r.job_name : <em style={{color:'#888'}}>No name</em>}</td>
                        <td style={{ color: '#b388ff', fontWeight: 600 }}>{fmt(r.cost_30d_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Failed Run Cost (30d)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="DBU cost burned on failed job runs.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'job_failed_cost' ? 'active' : ''}`} onClick={() => onRadarClick('job_failed_cost', getJobMetrics())} title="Analyze Failed Run Cost"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={failedTrace} id="chart-failed-cost"
                layout={{ yaxis:{tickprefix:'$'} }} />
            </div>
          </div>

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
