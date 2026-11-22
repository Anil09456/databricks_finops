import { useEffect, useState } from 'react'
import { sqlWarehouse as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { Warehouse, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${Number(n).toFixed(0)}`
const pct = (a,b) => b ? ((a-b)/Math.abs(b))*100 : null

export default function SqlWarehouseTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [health,     setHealth]     = useState([])
  const [heatmap,    setHeatmap]    = useState([])
  const [topQ,       setTopQ]       = useState([])
  const [cacheTrend, setCacheTrend] = useState([])
  const [classicKpi, setClassicKpi] = useState({})
  const [classicD,   setClassicD]   = useState([])
  const [serverlessKpi, setServerlessKpi] = useState({})
  const [serverlessD, setServerlessD]     = useState([])
  const [idle,       setIdle]       = useState([])
  const [repeatKpi,  setRepeatKpi]  = useState({})
  const [loading,    setLoading]    = useState(true)
  const [analyze,    setAnalyze]    = useState(null)
  const [analyzing,  setAnalyzing]  = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [h,hm,tq,ct,ck,cd,sk,sd,il,rk] = await Promise.all([
        api.health(workspaceId), api.heatmap(workspaceId), api.topQueries(workspaceId), api.cacheTrend(workspaceId),
        api.classicCost(workspaceId), api.classicDaily(workspaceId), api.serverlessCost(workspaceId),
        api.serverlessDaily(workspaceId), api.idleBilling(workspaceId), api.repeatQueryKpi(workspaceId),
      ])
      setHealth(h); setHeatmap(hm); setTopQ(tq); setCacheTrend(ct)
      setClassicKpi(ck[0]||{}); setClassicD(cd)
      setServerlessKpi(sk[0]||{}); setServerlessD(sd)
      setIdle(il); setRepeatKpi(rk[0]||{})
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('sql_wh')
      await load()
      if (onShowToast) onShowToast("Dashboards are refreshed!")
    } finally {
      setRefreshing(false)
    }
  }


  const getWarehouseMetrics = () => {
    const totals = health.reduce((a,r) => {
      a.cache += r.cache_hit_pct || 0; a.queued += r.queued_count || 0
      a.p90   += r.p90_duration_s || 0; a.failed += r.failed_count || 0; a.n++
      return a
    }, { cache:0, queued:0, p90:0, failed:0, n:0 })
    const n = totals.n || 1
    const totalGb = topQ.reduce((acc, curr) => acc + (curr.gb_scanned || 0), 0)
    const avgIdle = idle.reduce((s,r) => s + (r.idle_pct||0), 0) / Math.max(idle.length, 1)
    return {
      cache_hit_pct: totals.cache / n,
      queued_count:  totals.queued,
      p90_duration_s: totals.p90 / n,
      failed_count:  totals.failed,
      total_gb_scanned: totalGb,
      mv_candidate_count: repeatKpi.mv_candidate_count || 0,
      idle_billing_pct: avgIdle || 0,
    }
  }

  const handleAnalyze = async () => {
    if (analyze) { setAnalyze(null); return }
    setAnalyzing(true)
    try {
      const res = await analyzeAPI.detect('sql_warehouse', getWarehouseMetrics())
      setAnalyze(res)
    } finally { setAnalyzing(false) }
  }

  // Hourly query distribution (stacked bar chart)
  const daysName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const BAR_COLORS = ['#00d4ff', '#00ff88', '#b388ff', '#ffaa00', '#ff3366', '#4fc3f7', '#a78bfa']
  const hours = Array.from({length:24}, (_,i) => `${i}:00`)

  const heatTrace = Array.from({length:7}, (_, d) => {
    const dayData = Array.from({length:24}, (_, h) => {
      const cell = heatmap.find(r => r.day_of_week === d+1 && r.hour_of_day === h)
      return cell?.query_count || 0
    })
    return {
      type: 'bar',
      name: daysName[d],
      x: hours,
      y: dayData,
      marker: { color: BAR_COLORS[d] }
    }
  })


  const calculateHealthScore = (r) => {
    let score = 100;
    
    // 1. Cache hit % (target >= 60%)
    const ch = r.cache_hit_pct ?? 0;
    if (ch < 60) {
      score -= Math.round((60 - ch) * 0.5);
    }
    
    // 2. Queued count (target = 0)
    const q = r.queued_count ?? 0;
    if (q > 0) {
      score -= Math.min(q * 5, 25);
    }
    
    // 3. Failed count (target = 0)
    const f = r.failed_count ?? 0;
    if (f > 0) {
      score -= Math.min(f * 10, 30);
    }
    
    // 4. P90 query duration (target < 120s)
    const p90 = r.p90_duration_s ?? 0;
    if (p90 > 120) {
      score -= 15;
      if (p90 > 300) {
        score -= 15;
      }
    }
    
    return Math.max(score, 0);
  }

  const getHealthBadge = (score) => {
    if (score >= 85) {
      return { text: 'Healthy', color: '#00ff88', bg: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0, 255, 136, 0.2)' };
    } else if (score >= 60) {
      return { text: 'Warning', color: '#ffaa00', bg: 'rgba(255, 170, 0, 0.1)', border: '1px solid rgba(255, 170, 0, 0.2)' };
    } else {
      return { text: 'Critical', color: '#ff3366', bg: 'rgba(255, 51, 102, 0.1)', border: '1px solid rgba(255, 51, 102, 0.2)' };
    }
  }

  const whs = [...new Set(cacheTrend.map(r => r.warehouse_id))]
  const COLORS = ['#00d4ff','#00ff88','#b388ff','#ffaa00','#ff3366']
  const ctTraces = whs.map((wh, i) => {
    const rows = cacheTrend.filter(r => r.warehouse_id === wh)
    const name = rows[0]?.warehouse_name || wh.slice(-12)
    return {
      type: 'scatter', mode: 'lines', name: name,
      x: rows.map(r => r.query_date), y: rows.map(r => r.cache_hit_pct),
      line: { color: COLORS[i % COLORS.length] },
    }
  })

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">SQL Warehouses</div>
          <div className="panel-subtitle">system.query.history + billing.usage · 7-day performance view</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-sqlwh-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze?'active':''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-sqlwh-analyze">
          {analyzing?'':''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-sqlwh-radar"
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

      {loading ? <div className="spinner-wrap"><div className="spinner"/><span>Loading warehouse data…</span></div> : (
        <>
          {/* 💡 Collapsible Metric Interpretation Guide */}
          <div 
            className="dashboard-panel" 
            style={{ 
              margin: '0 0 16px 0', 
              background: 'rgba(30, 41, 59, 0.4)', 
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)'
            }}
          >
            <div 
              onClick={() => setShowGuide(!showGuide)} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                cursor: 'pointer',
                padding: '12px 16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>💡</span>
                <span style={{ fontWeight: '600', color: 'var(--text-hi)', fontSize: '14px' }}>
                  How to Interpret Warehouse Health & Performance Metrics
                </span>
              </div>
              <span style={{ 
                color: 'var(--text-muted)', 
                transform: showGuide ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
                fontSize: '12px'
              }}>
                ▼
              </span>
            </div>
            
            {showGuide && (
              <div style={{ 
                padding: '0 16px 16px 16px', 
                borderTop: '1px solid var(--border)', 
                marginTop: '0px', 
                fontSize: '13px', 
                color: 'var(--text-muted)',
                lineHeight: '1.6'
              }}>
                <div className="grid-2" style={{ gap: '16px', marginTop: '12px' }}>
                  <div>
                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#00d4ff' }}></span>
                      Warehouse Health Score
                    </h4>
                    <p style={{ margin: '0 0 12px 0' }}>
                      A composite indicator from <strong>0 to 100</strong> representing the overall efficiency. Score is penalized by low cache hits (&lt;60%), query queuing, execution failures, or slow P90 durations (&gt;120s).
                    </p>
                    
                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }}></span>
                      Cache Hit Rate (Target: &ge; 60%)
                    </h4>
                    <p style={{ margin: '0 0 12px 0' }}>
                      The percentage of query executions served from Databricks result cache. 
                      <br />
                      <span style={{ color: 'var(--green)' }}><strong>FinOps Tip:</strong></span> If low, users are repeating queries on un-cached static data. Consider refactoring queries to avoid dynamic/volatile calls (e.g. <code>CURRENT_TIMESTAMP()</code>) so they can use results cache.
                    </p>
                    
                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)' }}></span>
                      Queued Queries (Target: 0)
                    </h4>
                    <p style={{ margin: '0 0 0 0' }}>
                      Number of queries that waited because the warehouse reached maximum cluster capacity. 
                      <br />
                      <span style={{ color: 'var(--red)' }}><strong>FinOps Tip:</strong></span> Indicates warehouse saturation. Consider increasing the <em>Max Clusters</em> scaling limit, or migrating to <strong>Serverless SQL Warehouses</strong> for faster, fine-grained scaling.
                    </p>
                  </div>
                  
                  <div>
                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--amber)' }}></span>
                      P90 Query Duration (Target: &lt; 120s)
                    </h4>
                    <p style={{ margin: '0 0 12px 0' }}>
                      The 90th percentile execution time. 90% of queries finish faster than this.
                      <br />
                      <span style={{ color: 'var(--amber)' }}><strong>FinOps Tip:</strong></span> Elevated P90 duration indicates heavy scans or complex joins. Check the <em>Top 10 Expensive Queries</em> table below to pinpoint specific unoptimized statements.
                    </p>

                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--red)' }}></span>
                      Failed Queries (Target: 0)
                    </h4>
                    <p style={{ margin: '0 0 12px 0' }}>
                      Queries that ended in failure. Errored queries consume VM resources and burn budget without producing business value.
                      <br />
                      <span style={{ color: 'var(--red)' }}><strong>FinOps Tip:</strong></span> Track syntax errors, permission problems, or timeouts.
                    </p>

                    <h4 style={{ color: 'var(--text-hi)', margin: '0 0 8px 0', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#b388ff' }}></span>
                      GB Scanned
                    </h4>
                    <p style={{ margin: '0 0 0 0' }}>
                      Total volume of data read from storage. 
                      <br />
                      <span style={{ color: '#b388ff' }}><strong>FinOps Tip:</strong></span> High read volumes indicate full table scans. Use indexing, running <code>OPTIMIZE</code> / <code>Z-ORDER</code> on target tables, and applying filters (e.g. partition keys) in SQL queries.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="chart-header-row" style={{ marginBottom: 12 }}>
            <div className="section-label">Per-Warehouse Health Summary</div>
            <div className="chart-header-actions">
              <span className="info-btn" title="Warehouse Health Scorecard: active queries, avg duration, P90 SLA, cache hits, queueing, failures, and bytes scanned.">ⓘ</span>
              <button className={`radar-btn ${activeChartId === 'wh_health_table' ? 'active' : ''}`} onClick={() => onRadarClick('wh_health_table', getWarehouseMetrics())} title="Analyze Warehouse Health"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
            </div>
          </div>
          {health.length > 0 ? (
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="data-table" id="tbl-wh-health">
                <thead>
                  <tr>
                    <th title="Resolved Warehouse Name and UUID Identifier">Warehouse</th>
                    <th title="Composite Health Score based on caching, queueing, failures, and speed (0 - 100)">Health Score</th>
                    <th title="Total queries executed in the last 7 days">Total Queries</th>
                    <th title="Average execution duration per query in seconds">Avg Duration</th>
                    <th title="90th percentile query execution duration (Target: < 120s)">P90 Duration</th>
                    <th title="Percentage of queries served from Databricks cache (Target: >= 60%)">Cache Hit %</th>
                    <th title="Queries queued due to capacity saturation (Target: 0)">Queued</th>
                    <th title="Queries that failed due to syntax or runtime errors (Target: 0)">Failed</th>
                    <th title="Total data scanned from storage (High values indicate missing indexing/partitioning)">GB Scanned</th>
                  </tr>
                </thead>
                <tbody>
                  {health.map((r, i) => {
                    const score = calculateHealthScore(r);
                    const badge = getHealthBadge(score);
                    return (
                      <tr key={i} style={{ transition: 'background 0.2s' }}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: '600', color: 'var(--text-hi)' }}>
                              {r.warehouse_name || 'Unnamed Warehouse'}
                            </span>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {r.warehouse_id}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span 
                              style={{ 
                                padding: '3px 8px', 
                                borderRadius: '4px', 
                                fontSize: '11px', 
                                fontWeight: 'bold',
                                color: badge.color,
                                backgroundColor: badge.bg,
                                border: badge.border
                              }}
                            >
                              {badge.text}
                            </span>
                            <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--text-hi)' }}>
                              {score}/100
                            </span>
                          </div>
                        </td>
                        <td>{r.total_queries?.toLocaleString()}</td>
                        <td>{r.avg_duration_s}s</td>
                        <td style={{ color: (r.p90_duration_s||0)>120 ? 'var(--red)' : 'var(--text-hi)' }}>
                          {r.p90_duration_s}s
                        </td>
                        <td style={{ color: (r.cache_hit_pct||0)<60 ? 'var(--amber)' : 'var(--green)', fontWeight: '500' }}>
                          {r.cache_hit_pct}%
                        </td>
                        <td style={{ color: (r.queued_count||0)>5 ? 'var(--red)' : 'var(--text-hi)' }}>
                          {r.queued_count}
                        </td>
                        <td style={{ color: (r.failed_count||0)>0 ? 'var(--red)' : 'var(--text-hi)' }}>
                          {r.failed_count}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {r.total_gb_scanned} GB
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-data">ℹ️ No warehouse query data for last 7 days</div>
          )}

          <div className="grid-2" style={{ marginBottom:16 }}>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Hourly Query Load (7d)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Stacked bar chart of queries by hour of day and day of week. Helps identify peak query load times.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'hourly_heatmap' ? 'active' : ''}`} onClick={() => onRadarClick('hourly_heatmap', getWarehouseMetrics())} title="Analyze Hourly Query Load"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={heatTrace} id="chart-heatmap"
                layout={{ barmode: 'stack', showlegend: true, margin:{t:20,r:20,b:50,l:50} }} />
            </div>
            <div className="dashboard-panel" style={{margin:0}}>
              <div className="chart-header-row">
                <div className="section-label">Cache Hit Trend by Warehouse (7d)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Daily cache hit rate trend per SQL warehouse. Values below 60% indicate bad query reuse.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'cache_trend' ? 'active' : ''}`} onClick={() => onRadarClick('cache_trend', getWarehouseMetrics())} title="Analyze Cache Hit Trend"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={ctTraces} id="chart-cache-trend"
                layout={{ yaxis:{ticksuffix:'%', range:[0,100]}, showlegend:true }} />
            </div>
          </div>

          <div className="section-label" style={{ marginBottom: 12 }}>Top 10 Expensive Queries (GB Scanned)</div>
          {topQ.length > 0 ? (
            <div style={{ overflowX:'auto', marginBottom:16 }}>
              <table className="data-table" id="tbl-top-queries">
                <thead><tr>
                  <th>User</th><th>GB Scanned</th><th>Duration (s)</th><th>Cached?</th><th>Date</th><th>Query Preview</th>
                </tr></thead>
                <tbody>
                  {topQ.map((r,i) => (
                    <tr key={i}>
                      <td>{r.executed_by}</td>
                      <td style={{color:'var(--amber)'}}>{r.gb_scanned} GB</td>
                      <td>{r.duration_s}s</td>
                      <td>{r.from_result_cache ? '✅' : '❌'}</td>
                      <td>{r.query_date}</td>
                      <td style={{maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:10}}
                        title={r.query_preview}>{r.query_preview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="no-data">ℹ️ No expensive queries (&gt;500 MB) in last 7 days</div>}

          <div className="kpi-row">
            <MetricCard id="wh-classic-cost" label="Classic WH (30d)" value={fmt(classicKpi.total_cost_30d)} accent="#4fc3f7" info="Classic warehouse billing cost, last 30 days." />
            <MetricCard id="wh-sl-cost" label="Serverless WH (30d)" value={fmt(serverlessKpi.total_cost_30d)} accent="#b388ff" info="Serverless warehouse billing cost, last 30 days." />
            <MetricCard id="wh-mv-candidates" label="MV Candidates" value={repeatKpi.mv_candidate_count ?? '—'} accent="#ffaa00" sub="queries >50×/day + >5GB" info="Materialized View candidates: queries run >50 times/day and scan >5GB." />
            <MetricCard id="wh-repeat" label="Repeat Queries" value={repeatKpi.repeat_query_count ?? '—'} accent="#ff3366" info="Count of identical queries run repeatedly without caching." />
            <MetricCard id="wh-wasted-gb" label="Wasted GB Scanned" value={repeatKpi.total_wasted_gb ? `${repeatKpi.total_wasted_gb} GB` : '—'} accent="#ff3366" info="Estimated volume of data scanned due to redundant query executions." />
          </div>

          {idle.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">💤 Idle Warehouse Billing</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Identifies cost wasted on warehouses running without active queries. Adjust auto-stop to prevent this.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'idle_billing' ? 'active' : ''}`} onClick={() => onRadarClick('idle_billing', getWarehouseMetrics())} title="Analyze Idle Warehouse Billing"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <table className="data-table" id="tbl-idle-billing">
                <thead><tr>
                  <th title="Warehouse Name and ID">Warehouse</th>
                  <th title="Number of days the warehouse incurred cost in the last 7 days">Billed Days</th>
                  <th title="Number of days the warehouse executed at least one query">Active Days</th>
                  <th title="Days running completely idle with no queries (Billed Days - Active Days)">Idle Days</th>
                  <th title="Percentage of billed days that were idle (Target: < 20%)">Idle %</th>
                  <th title="Total warehouse billing cost in the last 7 days">Total Cost</th>
                  <th title="Estimated money wasted on idle compute hours">Est. Idle Cost</th>
                </tr></thead>
                <tbody>
                  {idle.map((r,i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-hi)' }}>
                            {r.warehouse_name || 'Unnamed Warehouse'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {r.warehouse_id}
                          </span>
                        </div>
                      </td>
                      <td>{r.billed_days}</td>
                      <td>{r.active_days}</td>
                      <td>{r.idle_days}</td>
                      <td style={{color:(r.idle_pct||0)>50?'var(--red)':'var(--amber)'}}>{r.idle_pct}%</td>
                      <td>{fmt(r.total_cost_usd)}</td>
                      <td style={{color:'var(--red)'}}>{fmt(r.estimated_idle_cost_usd)}</td>
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
