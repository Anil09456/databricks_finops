import { useEffect, useState } from 'react'
import { interactive as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { Monitor, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'

function fmt(n) { if (n == null) return '—'; if (n >= 1e3) return `$${(n/1e3).toFixed(1)}K`; return `$${Number(n).toFixed(0)}` }
function pct(a, b) { return b ? ((a - b) / Math.abs(b)) * 100 : null }

export default function InteractiveTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [cKpi, setCKpi]     = useState({})
  const [cDaily, setCDaily] = useState([])
  const [cClusters, setCClusters] = useState([])
  const [sKpi, setSKpi]     = useState({})
  const [sDaily, setSDaily] = useState([])
  const [scan, setScan]     = useState([])
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [ck, cd, cc, sk, sd, sc] = await Promise.all([
        api.classicKpi(workspaceId), api.classicDaily(workspaceId), api.classicClusters(workspaceId),
        api.serverlessKpi(workspaceId), api.serverlessDaily(workspaceId), api.sessionScan(workspaceId),
      ])
      setCKpi(ck[0] || {}); setCDaily(cd); setCClusters(cc)
      setSKpi(sk[0] || {}); setSDaily(sd); setScan(sc)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('interactive')
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
      const k = cKpi
      const wowPct = pct(k.cost_7d, k.cost_prev_7d) || 0
      const res = await analyzeAPI.detect('all_purpose_compute', {
        wow_pct_change: wowPct,
        untagged_pct: 0,
      })
      setAnalyze(res)
    } finally { setAnalyzing(false) }
  }

  const getInteractiveMetrics = () => ({
    wow_pct_change: pct(cKpi.cost_7d, cKpi.cost_prev_7d) || 0,
    untagged_pct: cClusters.some(c => c.team === 'untagged') ? 15 : 0,
    total_gb_scanned: scan.reduce((acc, r) => acc + (r.avg_gb_per_session || 0), 0),
  })

  const k = cKpi
  const delta = pct(k.cost_7d, k.cost_prev_7d)
  const wow = delta || 0
  const n_clusters = k.cluster_count ?? 0
  const n_teams = k.team_count ?? 0
  const untagged = cClusters.filter(c => c.team === 'untagged').length

  const s_total = sKpi.total_cost_30d ?? 0
  const s_7d = sKpi.cost_7d ?? 0
  const s_p7d = sKpi.cost_prev_7d ?? 1
  const s_wow = pct(s_7d, s_p7d) || 0
  const s_sessions = sKpi.session_count ?? 0

  const classicDailyMap = {}
  cDaily.forEach(r => {
    const d = r.usage_date
    classicDailyMap[d] = (classicDailyMap[d] || 0) + (r.daily_cost_usd || 0)
  })
  const classicSortedDates = Object.keys(classicDailyMap).sort()
  const classicDailyTrace = [{
    type: 'bar',
    x: classicSortedDates,
    y: classicSortedDates.map(d => classicDailyMap[d]),
    marker: { color: '#00d4ff' },
    hovertemplate: '<b>%{x}</b><br>Cost: $%{y:,.2f}<extra></extra>',
  }]

  const teamMap = {}
  cClusters.forEach(c => {
    const t = c.team || 'untagged'
    teamMap[t] = (teamMap[t] || 0) + (c.cost_30d_usd || 0)
  })
  const teamAgg = Object.entries(teamMap)
    .map(([team, cost]) => ({ team, cost }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 6)

  const teamTrace = [{
    type: 'bar',
    x: teamAgg.map(t => t.team),
    y: teamAgg.map(t => t.cost),
    marker: { color: '#b388ff' },
    hovertemplate: '<b>%{x}</b><br>Cost: $%{y:,.2f}<extra></extra>',
  }]

  const serverlessDailyMap = {}
  sDaily.forEach(r => {
    const d = r.usage_date
    serverlessDailyMap[d] = (serverlessDailyMap[d] || 0) + (r.daily_cost_usd || 0)
  })
  const serverlessSortedDates = Object.keys(serverlessDailyMap).sort()
  const serverlessDailyTrace = [{
    type: 'bar',
    x: serverlessSortedDates,
    y: serverlessSortedDates.map(d => serverlessDailyMap[d]),
    marker: { color: '#ffaa00' },
    hovertemplate: '<b>%{x}</b><br>Cost: $%{y:,.2f}<extra></extra>',
  }]

  const scanTrace = [{
    type: 'scatter', mode: 'lines+markers', name: 'Avg GB/session',
    x: scan.map(r => r.query_date),
    y: scan.map(r => r.avg_gb_per_session),
    line: { color: '#ffaa00', width: 2 },
    marker: { size: 5, color: '#ffaa00' },
    fill: 'tozeroy', fillcolor: 'rgba(255,170,0,0.10)',
    hovertemplate: '<b>%{x}</b><br>Avg GB/session: %{y:.2f}<extra></extra>',
  }]

  const wowCol = wow > 20 ? '#ff3366' : (wow > 5 ? '#ffaa00' : '#00ff88')
  const utCol = untagged > 0 ? '#ff3366' : '#00ff88'
  const swowCol = s_wow > 20 ? '#ff3366' : (s_wow > 5 ? '#ffaa00' : '#00ff88')

  return (
    <div>
      <TabHeader
        icon={Monitor}
        title="Interactive Computes"
        subtitle="Classic (ALL_PURPOSE) + Serverless (INTERACTIVE) · 30-day view"
        refreshing={refreshing} onRefresh={handleRefresh} refreshId="btn-interactive-refresh"
        analyzing={analyzing} onAnalyze={handleAnalyze} analyzeActive={!!analyze} analyzeId="btn-interactive-analyze"
        onInsights={() => onRadarClick(null, null)} insightsId="btn-interactive-radar"
        workspaceId={workspaceId} workspaces={workspaces}
        onWorkspaceChange={setWorkspaceId}
        onReloadWorkspaces={onReloadWorkspaces} loadingWorkspaces={loadingWorkspaces}
      />

      {loading ? <div className="spinner-wrap"><div className="spinner" /><span>Loading compute data…</span></div> : (
        <>
          {/* Classic section */}
          <div className="section-label">Classic (All-Purpose) Clusters</div>
          <div className="kpi-row">
            <MetricCard id="classic-cost-30d" label="TOTAL COST" value={fmt(k.total_cost_30d)} accent="#00d4ff" info="Classic cluster spend, last 30 days." />
            <MetricCard id="classic-cost-wow" label="WoW CHANGE" value={`${wow > 0 ? '↑' : '↓'} ${Math.abs(wow).toFixed(1)}%`} sub="vs prev 7 days" accent={wowCol} info="Week-over-week cost change." />
            <MetricCard id="classic-cluster-count" label="CLUSTERS" value={n_clusters} sub="Active last 30 days" accent="#b388ff" info="Distinct classic clusters active in last 30 days." />
            <MetricCard id="classic-team-count" label="TEAMS" value={n_teams} sub="Distinct team tags" accent="#00d4ff" info="Number of distinct team tags." />
            <MetricCard id="classic-untagged" label="UNTAGGED" value={untagged} sub="No team tag" accent={utCol} info="Clusters missing a team tag." />
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">DAILY CLASSIC COST (USD)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily DBU spend for Classic interactive compute.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'classic_daily_cost' ? 'active' : ''}`} onClick={() => onRadarClick('classic_daily_cost', getInteractiveMetrics())} title="Analyze Classic Daily Cost"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={classicDailyTrace} id="chart-classic-daily"
                layout={{ yaxis: { tickprefix: '$' } }} />
            </div>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">COST BY TEAM (30d)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks classic compute cost breakdown by team.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'classic_cost_by_team' ? 'active' : ''}`} onClick={() => onRadarClick('classic_cost_by_team', getInteractiveMetrics())} title="Analyze Cost by Team"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={teamTrace} id="chart-classic-team"
                layout={{ yaxis: { tickprefix: '$' } }} />
            </div>
          </div>

          {cClusters.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="section-label" style={{ marginBottom: 8, marginTop: 8 }}>TOP CLASSIC CLUSTERS BY COST</div>
              <table className="data-table" id="tbl-classic-clusters">
                <thead>
                  <tr>
                    <th>Cluster</th>
                    <th>Team</th>
                    <th>Owner</th>
                    <th>Cost (30d $)</th>
                    <th>DBUs</th>
                    <th>Active Days</th>
                  </tr>
                </thead>
                <tbody>
                  {cClusters.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{r.cluster_name}</td>
                      <td>
                        <span className={`badge badge-${r.team === 'untagged' ? 'critical' : 'low'}`}>
                          {r.team}
                        </span>
                      </td>
                      <td>{r.owner}</td>
                      <td>${Number(r.cost_30d_usd || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td>{Number(r.total_dbus || 0).toFixed(1)}</td>
                      <td>{r.active_days}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <hr className="sep" />

          {/* Serverless section */}
          <div className="section-label">Serverless Interactive Compute</div>
          <div className="kpi-row">
            <MetricCard id="sl-cost-30d" label="SERVERLESS COST" value={fmt(s_total)} accent="#ffaa00" info="Serverless interactive sessions spend, last 30 days." />
            <MetricCard id="sl-cost-wow" label="WoW CHANGE" value={`${s_wow > 0 ? '↑' : '↓'} ${Math.abs(s_wow).toFixed(1)}%`} sub="vs prev 7 days" accent={swowCol} info="Week-over-week cost change for serverless." />
            <MetricCard id="sl-sessions" label="SESSIONS" value={s_sessions} sub="Active last 30 days" accent="#b388ff" info="Distinct serverless session IDs." />
          </div>

          <div className="grid-2">
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">DAILY SERVERLESS COST (USD)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily DBU spend for serverless interactive sessions.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'serverless_ic_daily' ? 'active' : ''}`} onClick={() => onRadarClick('serverless_ic_daily', getInteractiveMetrics())} title="Analyze Serverless Daily Cost"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={serverlessDailyTrace} id="chart-sl-daily"
                layout={{ yaxis: { tickprefix: '$' } }} />
            </div>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">GB SCANNED PER INTERACTIVE SESSION (14 DAYS)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks average GB scanned per interactive session over 14 days.">ⓘ</span>
                  <button className={`radar-btn ${activeChartId === 'session_scan_trend' ? 'active' : ''}`} onClick={() => onRadarClick('session_scan_trend', getInteractiveMetrics())} title="Analyze Session GB Scan Trend"><SvgIcon icon={Radar} size={13} color="currentColor" /></button>
                </div>
              </div>
              <PlotlyChart data={scanTrace} id="chart-session-scan"
                layout={{ yaxis: { ticksuffix: ' GB' } }} />
            </div>
          </div>

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
