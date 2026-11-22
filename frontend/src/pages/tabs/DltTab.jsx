import { useEffect, useState } from 'react'
import { dlt as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { GitMerge, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${Number(n).toFixed(0)}`
const pct = (a,b) => b ? ((a-b)/Math.abs(b))*100 : null

export default function DltTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [cKpi, setCKpi]     = useState({})
  const [cPipes, setCPipes] = useState([])
  const [cDaily, setCDaily] = useState([])
  const [sKpi, setSKpi]     = useState({})
  const [sPipes, setSPipes] = useState([])
  const [sDaily, setSDaily] = useState([])
  const [health, setHealth] = useState([])
  const [healthKpi, setHealthKpi] = useState({})
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [ck,cp,cd,sk,sp,sd,h,hk] = await Promise.all([
        api.classicKpi(workspaceId), api.classicPipelines(workspaceId), api.classicDaily(workspaceId),
        api.serverlessKpi(workspaceId), api.serverlessPipelines(workspaceId), api.serverlessDaily(workspaceId),
        api.pipelineHealth(workspaceId), api.healthKpi(workspaceId),
      ])
      setCKpi(ck[0]||{}); setCPipes(cp); setCDaily(cd)
      setSKpi(sk[0]||{}); setSPipes(sp); setSDaily(sd)
      setHealth(h); setHealthKpi(hk[0]||{})
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('dlt')
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
      const res = await analyzeAPI.detect('delta_live_tables', {
        wow_pct_change: pct(cKpi.cost_7d, cKpi.cost_prev_7d) || 0,
        failed_count: healthKpi.total_failed_runs || 0,
        dlt_backpressure: (healthKpi.growing_pipelines || 0) > 0 ? 1 : 0,
      })
      setAnalyze(res)
    } finally { setAnalyzing(false) }
  }

  const getDltMetrics = () => {
    return {
      wow_pct_change: pct(cKpi.cost_7d, cKpi.cost_prev_7d) || 0,
      failed_count: healthKpi.total_failed_runs || 0,
      dlt_backpressure: (healthKpi.growing_pipelines || 0) > 0 ? 1 : 0
    }
  }

  const COLORS = ['#00d4ff','#b388ff','#00ff88','#ffaa00','#ff3366']

  const tiers = [...new Set(cDaily.map(r => r.tier))]
  const classicDailyTraces = tiers.map((t, i) => {
    const rows = cDaily.filter(r => r.tier === t)
    return { type:'bar', name:t, x:rows.map(r => r.usage_date), y:rows.map(r => r.daily_cost_usd), marker:{color:COLORS[i]} }
  })

  const sDailyTrace = [{
    type:'scatter', mode:'lines+markers',
    x:sDaily.map(r => r.usage_date),
    y:sDaily.map(r => r.daily_cost_usd),
    line:{color:'#b388ff'}, fill:'tozeroy', fillcolor:'#b388ff15',
  }]

  const healthTrace = cPipes.length ? [{
    type: 'bar',
    x: cPipes.slice(0,10).map(r => (r.pipeline_name||r.pipeline_id||'?').slice(0,20)),
    y: cPipes.slice(0,10).map(r => r.cost_30d_usd),
    marker: { color: '#00d4ff' },
  }] : []

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">Delta Live Tables</div>
          <div className="panel-subtitle">Classic DLT + Serverless DLT · 30-day view</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-dlt-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze?'active':''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-dlt-analyze">
          {analyzing?'':''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-dlt-radar"
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

      {loading ? <div className="spinner-wrap"><div className="spinner"/><span>Loading DLT data…</span></div> : (
        <>
          {/* Health KPI strip */}
          <div className="kpi-row">
            <MetricCard id="dlt-ck-cost" label="Classic DLT (30d)" value={fmt(cKpi.total_cost_30d)} accent="#4fc3f7" info="Classic DLT pipelines billing cost, last 30 days." />
            <MetricCard id="dlt-sk-cost" label="Serverless DLT (30d)" value={fmt(sKpi.total_cost_30d)} accent="#b388ff" info="Serverless DLT pipelines billing cost, last 30 days." />
            <MetricCard id="dlt-pipes" label="Total Pipelines" value={(cKpi.pipeline_count||0)+(sKpi.pipeline_count||0)} accent="#00ff88" info="Count of distinct Delta Live Tables pipelines active in last 30 days." />
            <MetricCard id="dlt-failed" label="Failed Runs (7d)" value={healthKpi.total_failed_runs ?? '—'} accent="#ff3366" info="Total failed pipeline runs, last 7 days." />
            <MetricCard id="dlt-growing" label="Degrading Pipelines" value={healthKpi.growing_pipelines ?? '—'} accent="#ffaa00" sub=">10% run time growth" info="Pipelines whose average run duration grew by >10% week-over-week (potential backpressure)." />
          </div>

          <div className="grid-2" style={{marginBottom:16}}>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Classic DLT Daily Cost by Tier</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily Classic DLT spend broken down by product tier.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'classic_dlt_daily' ? 'active' : ''}`} onClick={() => onRadarClick('classic_dlt_daily', getDltMetrics())} title="Analyze Classic DLT"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={classicDailyTraces} id="chart-dlt-classic"
                layout={{ barmode:'stack', yaxis:{tickprefix:'$'}, showlegend:true }} />
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Serverless DLT Daily Cost</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily Serverless DLT spend trend.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'serverless_dlt_daily' ? 'active' : ''}`} onClick={() => onRadarClick('serverless_dlt_daily', getDltMetrics())} title="Analyze Serverless DLT"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={sDailyTrace} id="chart-dlt-sl"
                layout={{ yaxis:{tickprefix:'$'} }} />
            </div>
          </div>

          <div className="grid-2">
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Top Classic Pipelines by Cost</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Top classic DLT pipelines ranked by 30-day billing cost.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'dlt_run_duration' ? 'active' : ''}`} onClick={() => onRadarClick('dlt_run_duration', getDltMetrics())} title="Analyze DLT Pipeline Duration"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              {healthTrace.length ? (
                <PlotlyChart data={healthTrace} id="chart-dlt-pipes" layout={{yaxis:{tickprefix:'$'}, xaxis:{tickangle:-30}}} />
              ) : <div className="no-data">ℹ️ No classic DLT pipelines found</div>}
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Pipeline Run Health (7d)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks pipeline runs, average runtime, failed count, and failure rate.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'dlt_run_results' ? 'active' : ''}`} onClick={() => onRadarClick('dlt_run_results', getDltMetrics())} title="Analyze DLT Run Health"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              {health.length > 0 ? (
                <div style={{overflowX:'auto'}}>
                  <table className="data-table">
                    <thead><tr><th>Pipeline</th><th>Runs</th><th>Avg Min</th><th>Failed</th><th>Fail Rate</th></tr></thead>
                    <tbody>
                      {health.slice(0,8).map((r,i) => (
                        <tr key={i}>
                          <td style={{fontFamily:'var(--font-mono)',fontSize:10}}>{(r.pipeline_id||'').slice(-8)}</td>
                          <td>{r.run_count}</td>
                          <td>{r.avg_run_min}</td>
                          <td style={{color:(r.failed_runs||0)>0?'var(--red)':'var(--text-hi)'}}>{r.failed_runs}</td>
                          <td style={{color:(r.failure_rate_pct||0)>10?'var(--red)':'var(--text-hi)'}}>{r.failure_rate_pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="no-data">ℹ️ No pipeline run data</div>}
            </div>
          </div>

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
