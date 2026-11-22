import { useEffect, useState } from 'react'
import { merge as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { RefreshCcw, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })
const pct = (a, b) => b ? ((a - b) / Math.abs(b)) * 100 : null

export default function MergeClusteringTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [kpi, setKpi] = useState({})
  const [trend, setTrend] = useState([])
  const [lcCandidates, setLcCandidates] = useState([])
  const [writeAmp, setWriteAmp] = useState([])
  const [pyspark, setPyspark] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [k, t, lc, wa, ps] = await Promise.all([
        api.kpi(workspaceId),
        api.trend(workspaceId),
        api.lcCandidates(workspaceId),
        api.writeAmplification(workspaceId),
        api.pysparkWriteAudit(workspaceId)
      ])
      setKpi(k[0] || {})
      setTrend(t)
      setLcCandidates(lc)
      setWriteAmp(wa)
      setPyspark(ps)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('merge')
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
      const res = await analyzeAPI.detect('merge_health', {
        cost_trend_pct: Number(kpi.avg_weekly_cost_growth_pct || 0),
        write_amp_pct: Number(kpi.max_cost_variance_pct || 0),
        lc_candidate_count: Number(kpi.lc_candidate_count || 0),
        small_file_table_count: Number(kpi.small_file_table_count || 0),
      })
      setAnalyze(res)
    } finally {
      setAnalyzing(false)
    }
  }

  const getMergeMetrics = () => {
    return {
      cost_trend_pct: Number(kpi.avg_weekly_cost_growth_pct || 0),
      write_amp_pct: Number(kpi.max_cost_variance_pct || 0),
      lc_candidate_count: Number(kpi.lc_candidate_count || 0),
      small_file_table_count: Number(kpi.small_file_table_count || 0),
    }
  }

  // Charts
  const jobs = [...new Set(trend.map(r => r.job_name))]
  const palette = ['#00d4ff', '#ffaa00', '#ff3366', '#b388ff', '#00ff88']
  const trendTraces = jobs.map((job, idx) => {
    const sub = trend.filter(r => r.job_name === job).sort((a, b) => a.week_start.localeCompare(b.week_start))
    return {
      type: 'scatter',
      mode: 'lines+markers',
      name: job,
      x: sub.map(r => r.week_start),
      y: sub.map(r => Number(r.weekly_cost_usd || 0)),
      line: { color: palette[idx % palette.length], width: 2 },
      marker: { size: 5 },
      hovertemplate: '<b>%{name}</b><br>%{x}<br>$%{y:,.0f}<extra></extra>'
    }
  })

  const sortedLc = [...lcCandidates].sort((a, b) => Number(a.avg_daily_cost || 0) - Number(b.avg_daily_cost || 0)).slice(-8)
  const lcColors = sortedLc.map(r => {
    const t = Number(r.cost_trend_pct || 0)
    if (t > 15) return '#ff3366'
    if (t > 5) return '#ffaa00'
    return '#00d4ff'
  })
  const lcTrace = [{
    type: 'bar',
    x: sortedLc.map(r => Number(r.avg_daily_cost || 0)),
    y: sortedLc.map(r => r.job_name),
    orientation: 'h',
    marker: { color: lcColors },
    hovertemplate: '<b>%{y}</b><br>Avg/day: $%{x:.0f}<extra></extra>'
  }]

  const waTrace = [{
    type: 'bar',
    x: writeAmp.map(r => r.job_name),
    y: writeAmp.map(r => Number(r.cost_variance_pct || 0)),
    marker: {
      color: writeAmp.map(r => {
        const v = Number(r.cost_variance_pct || 0)
        return v > 150 ? '#ff3366' : (v > 80 ? '#ffaa00' : '#00d4ff')
      })
    },
    hovertemplate: '<b>%{x}</b><br>Cost variance: %{y:.0f}%<extra></extra>'
  }]

  const waLayout = {
    yaxis: { ticksuffix: '%' },
    shapes: [{
      type: 'line',
      x0: -0.5,
      y0: 100,
      x1: writeAmp.length - 0.5,
      y1: 100,
      line: { color: '#ffaa00', width: 1, dash: 'dot' }
    }]
  }

  // KPIs
  const avgGrowth = Number(kpi.avg_weekly_cost_growth_pct || 0)
  const maxVariance = Number(kpi.max_cost_variance_pct || 0)
  const lcCount = Number(kpi.lc_candidate_count || 0)
  const sfCount = Number(kpi.small_file_table_count || 0)

  const gcCol = avgGrowth > 15 ? '#ff3366' : (avgGrowth > 5 ? '#ffaa00' : '#00ff88')
  const vcCol = maxVariance > 100 ? '#ff3366' : (maxVariance > 50 ? '#ffaa00' : '#00ff88')
  const lcCol = lcCount > 3 ? '#ff3366' : (lcCount > 0 ? '#ffaa00' : '#00ff88')
  const sfcCol = sfCount > 0 ? '#ffaa00' : '#00ff88'

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">MERGE & Clustering Health</div>
          <div className="panel-subtitle">MERGE cost trend · Liquid Clustering candidates · Write amplification · PySpark output file audit</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-merge-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze ? 'active' : ''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-merge-analyze">
          {analyzing ? '' : ''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-merge-radar"
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

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /><span>Loading MERGE & Clustering data…</span></div>
      ) : (
        <>
          <div className="kpi-row">
            <MetricCard id="merge-growth" label="Avg Cost Growth" value={fmt(avgGrowth) + "%"} accent={gcCol} sub="WoW · last 8 weeks" info="Average week-over-week growth rate in MERGE query execution costs." />
            <MetricCard id="merge-variance" label="Max Write Variance" value={fmt(maxVariance) + "%"} accent={vcCol} sub="Max run cost delta" info="Maximum variation in cost between the fastest and slowest executions of the same MERGE job." />
            <MetricCard id="merge-lc" label="LC Candidates" value={fmt(lcCount)} accent={lcCol} sub="Cost growing + high freq" info="Count of jobs identified as high-priority candidates for Liquid Clustering." />
            <MetricCard id="merge-small-files" label="Small File Tables" value={fmt(sfCount)} accent={sfcCol} sub=">1000 files · <100 GB" info="Count of tables containing a high ratio of small files (less than 100MB per file), causing storage inefficiency." />
          </div>

          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="chart-header-row" style={{ marginBottom: 12 }}>
              <div className="section-label">Job Cost Trend (8 Weeks)</div>
              <div className="chart-header-actions">
                <span className="info-btn" title="Tracks the 8-week rolling cost of MERGE-heavy jobs. Steeper slopes indicate cost creep.">ⓘ</span>
                <button
                  className={`radar-btn ${activeChartId === 'merge_cost_trend' ? 'active' : ''}`}
                  onClick={() => onRadarClick('merge_cost_trend', getMergeMetrics())}
                  title="Analyze chart"
                >
                  📡
                </button>
              </div>
            </div>
            {trend.length ? (
              <PlotlyChart data={trendTraces} id="chart-merge-trend" layout={{ title: '8-Week Job Cost Trend (Steepening = MERGE Degradation)', yaxis: { tickprefix: '$' } }} />
            ) : (
              <div className="no-data">ℹ️ No job cost trend data available</div>
            )}
          </div>

          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="chart-header-row" style={{ marginBottom: 12 }}>
              <div className="section-label">💧 Liquid Clustering Candidates</div>
              <div className="chart-header-actions">
                <span className="info-btn" title="Identifies tables and jobs suitable for Databricks Liquid Clustering to reduce scan times.">ⓘ</span>
                <button
                  className={`radar-btn ${activeChartId === 'lc_candidates_bar' ? 'active' : ''}`}
                  onClick={() => onRadarClick('lc_candidates_bar', getMergeMetrics())}
                  title="Analyze chart"
                >
                  📡
                </button>
              </div>
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              <div>
                {lcCandidates.length ? (
                  <PlotlyChart data={lcTrace} id="chart-merge-lc" layout={{ title: 'Liquid Clustering Candidates' }} />
                ) : (
                  <div className="no-data">ℹ️ No Liquid Clustering candidates detected</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Top LC Candidates</div>
                {lcCandidates.length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Job</th>
                          <th>Active Days</th>
                          <th>Cost (30d)</th>
                          <th>Avg Daily</th>
                          <th>Trend %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lcCandidates.slice(0, 8).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 'bold' }}>{r.job_name}</td>
                            <td>{r.active_days_30d}</td>
                            <td>${Number(r.cost_30d_usd || 0).toFixed(0)}</td>
                            <td>${Number(r.avg_daily_cost || 0).toFixed(2)}</td>
                            <td style={{ color: Number(r.cost_trend_pct || 0) > 15 ? 'var(--red)' : (Number(r.cost_trend_pct || 0) > 5 ? 'var(--amber)' : 'var(--text-hi)') }}>
                              {Number(r.cost_trend_pct || 0).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-data">ℹ️ No candidate data</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">📝 Write Amplification (Run Cost Variance)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="High run cost variance indicates write amplification, where small writes update entire files.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'write_amp_bar' ? 'active' : ''}`}
                    onClick={() => onRadarClick('write_amp_bar', getMergeMetrics())}
                    title="Analyze chart"
                  >
                    📡
                  </button>
                </div>
              </div>
              {writeAmp.length ? (
                <PlotlyChart data={waTrace} id="chart-merge-wa" layout={{ ...waLayout, title: 'Write Amplification — Run Cost Variance % (High = Full-Table Rewrites)' }} />
              ) : (
                <div className="no-data">ℹ️ No write amplification detected (variance too low)</div>
              )}
            </div>

            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">PySpark Write Output File Audit</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Audits tables written by PySpark for small file count issues. Compact to resolve.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'pyspark_write_audit' ? 'active' : ''}`}
                    onClick={() => onRadarClick('pyspark_write_audit', getMergeMetrics())}
                    title="Analyze chart"
                  >
                    📡
                  </button>
                </div>
              </div>
              {pyspark.length ? (
                <>
                  <div style={{ overflowX: 'auto', maxHeight: 250 }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Schema</th>
                          <th>Table</th>
                          <th>Size GB</th>
                          <th>Est. Files</th>
                          <th>Last Write</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pyspark.slice(0, 8).map((r, i) => (
                          <tr key={i}>
                            <td>{r.table_schema}</td>
                            <td style={{ fontWeight: 'bold' }}>{r.table_name}</td>
                            <td>{Number(r.size_gb || 0).toFixed(1)} GB</td>
                            <td>{Number(r.file_count_estimate || 0).toLocaleString()}</td>
                            <td>{r.last_altered || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--amber)', marginTop: 8 }}>
                    💡 Fix: add <code>df.repartitionByRange(200, "date_col")</code> before write. Or run <code>OPTIMIZE table_name</code> after ingestion to compact small files.
                  </div>
                </>
              ) : (
                <div className="no-data">ℹ️ No tables with small-file issues detected</div>
              )}
            </div>
          </div>

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
