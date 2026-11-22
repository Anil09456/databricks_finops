import { useEffect, useState } from 'react'
import { queryIntelligence as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { SearchCode, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })
const pct = (a, b) => b ? ((a - b) / Math.abs(b)) * 100 : null

export default function QueryIntelligenceTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [kpi, setKpi] = useState({})
  const [spillEvents, setSpillEvents] = useState([])
  const [spillKpi, setSpillKpi] = useState({})
  const [repeatQueries, setRepeatQueries] = useState([])
  const [cacheBreakers, setCacheBreakers] = useState([])
  const [shuffleRatio, setShuffleRatio] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [k, se, sk, rq, cb, sr] = await Promise.all([
        api.kpi(workspaceId),
        api.spillEvents(workspaceId),
        api.spillKpi(workspaceId),
        api.repeatQueries(workspaceId),
        api.cacheBreakerUsers(workspaceId),
        api.shuffleRatio(workspaceId)
      ])
      setKpi(k[0] || {})
      setSpillEvents(se)
      setSpillKpi(sk[0] || {})
      setRepeatQueries(rq)
      setCacheBreakers(cb)
      setShuffleRatio(sr)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('qi')
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
      const res = await analyzeAPI.detect('query_intelligence', {
        spill_query_count: Number(kpi.spill_query_count || 0),
        avg_spill_pct: Number(spillKpi.avg_spill_pct || 0),
        cache_breaker_queries: Number(kpi.cache_breaker_queries || 0),
        mv_candidate_count: Number(kpi.large_uncached_queries || 0),
        avg_shuffle_ratio: Number(kpi.avg_shuffle_ratio || 0),
        total_gb_scanned: Number(kpi.total_spill_gb || 0) * 4,
      })
      setAnalyze(res)
    } finally {
      setAnalyzing(false)
    }
  }

  const getCommonMetrics = () => {
    return {
      spill_query_count: Number(kpi.spill_query_count || 0),
      avg_spill_pct: Number(spillKpi.avg_spill_pct || 0),
      cache_breaker_queries: Number(kpi.cache_breaker_queries || 0),
      mv_candidate_count: Number(kpi.large_uncached_queries || 0),
      avg_shuffle_ratio: Number(kpi.avg_shuffle_ratio || 0),
      total_gb_scanned: Number(kpi.total_spill_gb || 0) * 4,
    }
  }

  // Charts
  const spillEventsTrace = [{
    type: 'bar',
    x: spillEvents.map(r => r.query_date),
    y: spillEvents.map(r => Number(r.spill_gb || 0)),
    marker: { color: '#ff3366' },
    hovertemplate: '<b>%{x}</b><br>Spill: %{y:.2f} GB<extra></extra>'
  }]

  const scatterColors = repeatQueries.map(r => {
    const run = Number(r.run_count || 0)
    const gb = Number(r.avg_gb_per_run || 0)
    if (run >= 50 && gb >= 5) return '#ff3366'
    if (run >= 20 || gb >= 5) return '#ffaa00'
    return '#00d4ff'
  })

  const maxRun = Math.max(...repeatQueries.map(r => Number(r.run_count || 0)), 100)
  const maxGb = Math.max(...repeatQueries.map(r => Number(r.avg_gb_per_run || 0)), 50)

  const repeatScatterTrace = [{
    type: 'scatter',
    mode: 'markers',
    x: repeatQueries.map(r => r.run_count),
    y: repeatQueries.map(r => r.avg_gb_per_run),
    text: repeatQueries.map(r => r.query_sample || r.executed_by || ''),
    marker: { color: scatterColors, size: 10, opacity: 0.85 },
    hovertemplate: '<b>Runs/week: %{x}</b><br>Avg GB: %{y:.1f}<br>%{text}<extra></extra>'
  }]

  const repeatLayout = {
    yaxis: { ticksuffix: ' GB' },
    shapes: [{
      type: 'rect',
      x0: 50,
      y0: 5,
      x1: maxRun * 1.1,
      y1: maxGb * 1.1,
      fillcolor: 'rgba(255,51,102,0.08)',
      line: { color: '#ff3366', width: 1, dash: 'dot' }
    }]
  }

  const sortedBreakers = [...cacheBreakers].sort((a, b) => Number(a.cache_breaker_count || 0) - Number(b.cache_breaker_count || 0)).slice(-8)
  const breakerTrace = [{
    type: 'bar',
    x: sortedBreakers.map(r => r.cache_breaker_count),
    y: sortedBreakers.map(r => r.executed_by),
    orientation: 'h',
    marker: { color: '#ffaa00' },
    hovertemplate: '<b>%{y}</b><br>Cache-breaker queries: %{x}<extra></extra>'
  }]

  const warehouses = [...new Set(shuffleRatio.map(r => r.warehouse_id))]
  const palette = ['#00d4ff', '#ffaa00', '#b388ff', '#00ff88', '#ff3366']
  const shuffleTraces = warehouses.map((wh, idx) => {
    const sub = shuffleRatio.filter(r => r.warehouse_id === wh).sort((a, b) => a.query_date.localeCompare(b.query_date))
    return {
      type: 'scatter',
      mode: 'lines+markers',
      name: wh,
      x: sub.map(r => r.query_date),
      y: sub.map(r => Number(r.avg_task_total_ratio || 0)),
      line: { color: palette[idx % palette.length], width: 2 },
      marker: { size: 5 },
      hovertemplate: '<b>%{name}</b><br>%{x}<br>Ratio: %{y:.1f}x<extra></extra>'
    }
  })

  // KPI Colors
  const spillCount = Number(kpi.spill_query_count || 0)
  const totalSpillGb = Number(kpi.total_spill_gb || 0)
  const cacheBreakersCount = Number(kpi.cache_breaker_queries || 0)
  const mvCandidates = Number(kpi.large_uncached_queries || 0)
  const avgShuffle = Number(kpi.avg_shuffle_ratio || 0)

  const spillCol = spillCount > 0 ? '#ff3366' : '#00ff88'
  const spillGbCol = totalSpillGb > 10 ? '#ff3366' : (totalSpillGb > 1 ? '#ffaa00' : '#00ff88')
  const breakerCol = cacheBreakersCount > 20 ? '#ffaa00' : '#00d4ff'
  const mvCol = mvCandidates > 0 ? '#ff3366' : '#00ff88'
  const shuffleCol = avgShuffle > 4 ? '#ffaa00' : '#00d4ff'

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">Query Intelligence</div>
          <div className="panel-subtitle">Spill & skew detection · Repeat queries · Cache-breaker patterns · Shuffle analysis</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-qi-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze ? 'active' : ''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-qi-analyze">
          {analyzing ? '' : ''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-qi-radar"
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
        <div className="spinner-wrap"><div className="spinner" /><span>Loading Query Intelligence data…</span></div>
      ) : (
        <>
          <div className="kpi-row">
            <MetricCard id="qi-spill-events" label="Spill Events" value={fmt(spillCount)} accent={spillCol} sub="Any > 0 = alert" info="Total query runs that spilled data to local disk due to memory limits." />
            <MetricCard id="qi-spill-gb" label="Total Spill GB" value={fmt(totalSpillGb) + " GB"} accent={spillGbCol} sub="Last 7 days" info="Total volume of data spilled to disk, last 7 days." />
            <MetricCard id="qi-cache-breakers" label="Cache-Breakers" value={fmt(cacheBreakersCount)} accent={breakerCol} sub="CURRENT_DATE / RAND()" info="Queries containing volatile functions (e.g. CURRENT_DATE, RAND) that bypass caching." />
            <MetricCard id="qi-mv-candidates" label="MV Candidates" value={fmt(mvCandidates)} accent={mvCol} sub=">5GB · not cached" info="Materialized View candidates: queries run >50 times/day and scan >5GB." />
            <MetricCard id="qi-shuffle-ratio" label="Avg Shuffle Ratio" value={fmt(avgShuffle) + "x"} accent={shuffleCol} sub="task / total duration" info="Task execution time divided by total query duration. Higher values indicate high network/shuffle activity." />
          </div>

          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="chart-header-row" style={{ marginBottom: 12 }}>
              <div className="section-label">💧 Spill & Skew Detection</div>
              <div className="chart-header-actions">
                <span className="info-btn" title="Identifies queries that spilled data to local disk. High spill indicates memory exhaustion.">ⓘ</span>
                <button
                  className={`radar-btn ${activeChartId === 'spill_events_bar' ? 'active' : ''}`}
                  onClick={() => onRadarClick('spill_events_bar', getCommonMetrics())}
                  title="Analyze spill"
                >
                  📡
                </button>
              </div>
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              <div>
                {spillEvents.length ? (
                  <PlotlyChart data={spillEventsTrace} id="chart-qi-spill" layout={{ title: 'Spill-to-Disk per Query Event (GB)' }} />
                ) : (
                  <div className="no-data">ℹ️ No spill-to-disk events detected</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Top Spill Offenders</div>
                {spillEvents.length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Spill GB</th>
                          <th>Read GB</th>
                          <th>Spill %</th>
                          <th>Duration(s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spillEvents.slice(0, 8).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{(r.executed_by || '').split('@')[0]}</td>
                            <td>{Number(r.spill_gb).toFixed(2)} GB</td>
                            <td>{Number(r.read_gb).toFixed(2)} GB</td>
                            <td style={{ color: Number(r.spill_pct_of_read || 0) > 50 ? 'var(--red)' : 'var(--text-hi)' }}>
                              {Number(r.spill_pct_of_read || 0).toFixed(1)}%
                            </td>
                            <td>{r.duration_s}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-data">ℹ️ No spill data</div>
                )}
              </div>
            </div>
          </div>

          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="chart-header-row" style={{ marginBottom: 12 }}>
              <div className="section-label">🔁 Repeat Query & Materialized View Candidates</div>
              <div className="chart-header-actions">
                <span className="info-btn" title="Identifies identical query patterns run repeatedly. Good candidates for materialized views.">ⓘ</span>
                <button
                  className={`radar-btn ${activeChartId === 'repeat_query_scatter' ? 'active' : ''}`}
                  onClick={() => onRadarClick('repeat_query_scatter', getCommonMetrics())}
                  title="Analyze repeat queries"
                >
                  📡
                </button>
              </div>
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              <div>
                {repeatQueries.length ? (
                  <PlotlyChart data={repeatScatterTrace} id="chart-qi-repeat" layout={{ ...repeatLayout, title: 'Query Frequency × GB Scanned' }} />
                ) : (
                  <div className="no-data">ℹ️ No repeat queries detected</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>Candidate Queries</div>
                {repeatQueries.length ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Runs</th>
                          <th>Avg GB</th>
                          <th>Cache%</th>
                          <th>Sample</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repeatQueries.slice(0, 6).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{(r.executed_by || '').split('@')[0]}</td>
                            <td>{r.run_count}</td>
                            <td>{Number(r.avg_gb_per_run).toFixed(1)}</td>
                            <td>{Number(r.cache_hit_pct).toFixed(0)}%</td>
                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.query_sample}>
                              {r.query_sample}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-data">ℹ️ No repeat query data</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">⚡ Cache-Breaker Patterns per User</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Shows users executing queries that bypass cache due to volatile functions.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'cache_breaker_bar' ? 'active' : ''}`}
                    onClick={() => onRadarClick('cache_breaker_bar', getCommonMetrics())}
                    title="Analyze cache breakers"
                  >
                    📡
                  </button>
                </div>
              </div>
              {cacheBreakers.length ? (
                <>
                  <PlotlyChart data={breakerTrace} id="chart-qi-breakers" layout={{ title: 'Cache-Breaker Queries per User' }} />
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--amber)', marginTop: 8 }}>
                    💡 Fix: pass date as a string literal from the BI tool instead of using CURRENT_DATE() in the query body. Queries with volatile functions are never served from result cache.
                  </div>
                </>
              ) : (
                <div className="no-data">ℹ️ No cache breaker user data</div>
              )}
            </div>

            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">Shuffle Ratio Trend</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Task/Total Duration Ratio indicates network and data serialization overhead during shuffle operations.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'shuffle_ratio_line' ? 'active' : ''}`}
                    onClick={() => onRadarClick('shuffle_ratio_line', getCommonMetrics())}
                    title="Analyze shuffle ratio"
                  >
                    📡
                  </button>
                </div>
              </div>
              {shuffleRatio.length ? (
                <PlotlyChart data={shuffleTraces} id="chart-qi-shuffle" layout={{
                  title: 'Task/Total Duration Ratio — Shuffle Pressure Indicator',
                  yaxis: { ticksuffix: 'x' }
                }} />
              ) : (
                <div className="no-data">ℹ️ No shuffle ratio data</div>
              )}
            </div>
          </div>

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
