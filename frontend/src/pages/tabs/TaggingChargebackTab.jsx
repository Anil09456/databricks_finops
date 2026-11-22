import { useEffect, useState } from 'react'
import { chargeback as api, storage as storageApi, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import TabHeader from '../../components/layout/TabHeader'
import { Tag, Radar } from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'


const fmt = n => n == null ? '—' : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Number(n).toFixed(0)}`
const pct = (a, b) => b ? ((a - b) / Math.abs(b)) * 100 : null

export default function TaggingChargebackTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [kpis, setKpis] = useState({})
  const [teamSpend, setTeamSpend] = useState([])
  const [tagCoverage, setTagCoverage] = useState([])
  const [userLeaderboard, setUserLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyze, setAnalyze] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showUserDetail, setShowUserDetail] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [k, ts, tc, ul] = await Promise.all([
        api.kpis(workspaceId),
        api.teamSpend(workspaceId),
        api.tagCoverage(workspaceId),
        storageApi.userCostLeaderboard(workspaceId)
      ])
      setKpis(k || {})
      setTeamSpend(ts)
      setTagCoverage(tc)
      setUserLeaderboard(ul)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [workspaceId])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('chargeback')
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
      const res = await analyzeAPI.detect('chargeback', {
        untagged_pct: Number(kpis.untagged_pct || 0),
        tag_coverage_pct: Number(kpis.tag_coverage_pct || 0)
      })
      setAnalyze(res)
    } finally {
      setAnalyzing(false)
    }
  }

  const getChargebackMetrics = () => {
    return {
      untagged_pct: Number(kpis.untagged_pct || 0),
      tag_coverage_pct: Number(kpis.tag_coverage_pct || 0),
      anomaly_count: 0,
      total_gb_scanned: 250
    }
  }

  // 1. Team Spend Bar Chart
  // Group by team and sum cost
  const teamAggMap = {}
  teamSpend.forEach(r => {
    teamAggMap[r.team] = (teamAggMap[r.team] || 0) + Number(r.cost_usd || 0)
  })
  const teamAggList = Object.keys(teamAggMap).map(team => ({
    team,
    cost_usd: teamAggMap[team]
  })).sort((a, b) => a.cost_usd - b.cost_usd)

  const teamSpendTrace = [{
    type: 'bar',
    x: teamAggList.map(r => r.cost_usd),
    y: teamAggList.map(r => r.team),
    orientation: 'h',
    marker: {
      color: teamAggList.map(r => r.team.toUpperCase().includes('UNTAGGED') ? 'rgba(255,51,102,0.8)' : 'rgba(0,212,255,0.8)')
    },
    hovertemplate: '<b>%{y}</b><br>$%{x:,.0f}<extra></extra>'
  }]

  // 2. Tagging Coverage Donut
  const tagCounts = { FULLY_TAGGED: 0, INCOMPLETE: 0 }
  tagCoverage.forEach(r => {
    if (tagCounts[r.tag_status] !== undefined) {
      tagCounts[r.tag_status]++
    }
  })
  const tagLabels = Object.keys(tagCounts)
  const tagValues = Object.values(tagCounts)
  const tagColors = tagLabels.map(s => s === 'FULLY_TAGGED' ? '#00ff88' : '#ff3366')

  const donutTrace = [{
    type: 'pie',
    labels: tagLabels,
    values: tagValues,
    hole: 0.6,
    marker: { colors: tagColors, line: { color: '#0d1220', width: 2 } },
    textinfo: 'percent',
    textfont: { size: 10 },
    hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>'
  }]

  // 3. Quarterly Projection Bar Chart
  // Sort teams by cost descending and take top 8
  const topTeamsProj = [...teamAggList].reverse().slice(0, 8)
  // For projection we need the original rows, let's find the projection sum per team
  const teamProjMap = {}
  teamSpend.forEach(r => {
    teamProjMap[r.team] = (teamProjMap[r.team] || 0) + Number(r.quarterly_projection || 0)
  })

  const quarterlyProjTrace = [
    {
      name: '30-day Actual',
      type: 'bar',
      x: topTeamsProj.map(r => r.team),
      y: topTeamsProj.map(r => r.cost_usd),
      marker: { color: 'rgba(0,212,255,0.8)' },
      hovertemplate: '<b>%{x}</b><br>Actual: $%{y:,.0f}<extra></extra>'
    },
    {
      name: 'Quarterly Proj.',
      type: 'bar',
      x: topTeamsProj.map(r => r.team),
      y: topTeamsProj.map(r => teamProjMap[r.team] || 0),
      marker: { color: 'rgba(255,170,0,0.53)' },
      hovertemplate: '<b>%{x}</b><br>Projected: $%{y:,.0f}<extra></extra>'
    }
  ]

  // 4. User Leaderboard
  const sortedUsers = [...userLeaderboard].sort((a, b) => Number(a.cost_usd || 0) - Number(b.cost_usd || 0)).slice(-10)
  const userTrace = [{
    type: 'bar',
    x: sortedUsers.map(r => Number(r.cost_usd || 0)),
    y: sortedUsers.map(r => r.user_email),
    orientation: 'h',
    marker: { color: '#00d4ff' },
    text: sortedUsers.map(r => r.billing_origin_product),
    hovertemplate: '<b>%{y}</b><br>$%{x:,.0f} via %{text}<extra></extra>'
  }]

  // Incomplete clusters
  const incompleteClusters = tagCoverage.filter(r => r.tag_status === 'INCOMPLETE')

  // KPI Colors
  const attributed = Number(kpis.total_attributed_cost || 0)
  const unattributed = Number(kpis.total_unattributed_cost || 0)
  const coverage = Number(kpis.tag_coverage_pct || 0)
  const teamsCount = Number(kpis.total_teams || 0)
  const clustersCount = Number(kpis.total_clusters || 0)

  const unattribCol = unattributed > 1000 ? '#ff3366' : '#ffaa00'
  const coverageCol = coverage >= 80 ? '#00ff88' : (coverage >= 60 ? '#ffaa00' : '#ff3366')

  return (
    <div>
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title">Tagging & Cost Attribution</div>
          <div className="panel-subtitle">Team spend · Cluster tagging · Quarterly projections · Per-user cost</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-cb-refresh">
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze ? 'active' : ''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-cb-analyze">
          {analyzing ? '' : ''} Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${activeChartId === null && onRadarClick ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-cb-radar"
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
        <div className="spinner-wrap"><div className="spinner" /><span>Loading Attribution data…</span></div>
      ) : (
        <>
          <div className="kpi-row">
            <MetricCard id="cb-attributed" label="Attributed Cost" value={fmt(attributed)} accent="#00ff88" sub="With team tag" info="Cost with a valid team tag, last 30 days." />
            <MetricCard id="cb-unattributed" label="Unattributed Cost" value={fmt(unattributed)} accent={unattribCol} sub={`${(kpis.untagged_pct || 0).toFixed(1)}% of total`} info="Cost missing team tag (shadow spend), last 30 days." />
            <MetricCard id="cb-coverage" label="Tag Coverage" value={fmt(coverage) + "%"} accent={coverageCol} sub={coverage >= 80 ? '✓ Above target' : 'Target: 80%+'} info="Percentage of compute cost containing a valid team tag. Target is 80%+." />
            <MetricCard id="cb-teams" label="Teams Tracked" value={fmt(teamsCount)} accent="#b388ff" sub="Distinct teams" info="Count of distinct team tags found in billing logs." />
            <MetricCard id="cb-clusters" label="Clusters Tracked" value={fmt(clustersCount)} accent="#00d4ff" sub="Total clusters" info="Total count of active classic and serverless clusters audited." />
          </div>

          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">30-Day Spend by Team</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Total spend in the last 30 days attributed to each team based on team tags.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'team_spend_bar' ? 'active' : ''}`}
                    onClick={() => onRadarClick('team_spend_bar', getChargebackMetrics())}
                    title="Analyze chart"
                  >
                    📡
                  </button>
                </div>
              </div>
              {teamAggList.length ? (
                <PlotlyChart data={teamSpendTrace} id="chart-cb-teamspend" layout={{ title: 'Team Spend (30 days)' }} />
              ) : (
                <div className="no-data">ℹ️ No team spend data available</div>
              )}
            </div>

            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row" style={{ marginBottom: 12 }}>
                <div className="section-label">Cluster Team Tag Coverage</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Donut chart showing proportion of clusters that are fully tagged versus incomplete.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'tag_coverage_donut' ? 'active' : ''}`}
                    onClick={() => onRadarClick('tag_coverage_donut', getChargebackMetrics())}
                    title="Analyze chart"
                  >
                    📡
                  </button>
                </div>
              </div>
              {tagCoverage.length ? (
                <PlotlyChart data={donutTrace} id="chart-cb-donut" layout={{ title: 'Tag Coverage' }} />
              ) : (
                <div className="no-data">ℹ️ No cluster tagging data available</div>
              )}
            </div>
          </div>

          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="chart-header-row" style={{ marginBottom: 12 }}>
              <div className="section-label">Quarterly Cost Projection</div>
              <div className="chart-header-actions">
                <span className="info-btn" title="Compares team's 30-day actual spend against their projected quarterly run rate.">ⓘ</span>
                <button
                  className={`radar-btn ${activeChartId === 'quarterly_proj_bar' ? 'active' : ''}`}
                  onClick={() => onRadarClick('quarterly_proj_bar', getChargebackMetrics())}
                  title="Analyze chart"
                >
                  📡
                </button>
              </div>
            </div>
            {topTeamsProj.length ? (
              <PlotlyChart data={quarterlyProjTrace} id="chart-cb-quarterly" layout={{ title: 'Team Spend vs Quarterly Projection', barmode: 'group', xaxis: { tickangle: -20 } }} />
            ) : (
              <div className="no-data">ℹ️ No team projection data available</div>
            )}
          </div>

          {/* User Leaderboard Expander */}
          <div className="dashboard-panel" style={{ marginBottom: 16 }}>
            <div className="expander-header" onClick={() => setShowUserDetail(!showUserDetail)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 'bold' }}>👤 Per-User Cost Leaderboard</span>
                {showUserDetail && (
                  <div className="chart-header-actions" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                    <span className="info-btn" title="Identifies the top users by DBU spend across classic and serverless compute." style={{ marginRight: 6 }}>ⓘ</span>
                    <button
                      className={`radar-btn ${activeChartId === 'user_cost_leaderboard' ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRadarClick('user_cost_leaderboard', getChargebackMetrics());
                      }}
                      title="Analyze chart"
                    >
                      📡
                    </button>
                  </div>
                )}
              </div>
              <div>{showUserDetail ? '▲ Hide Details' : '▼ View details'}</div>
            </div>
            {showUserDetail && (
              <div style={{ marginTop: 12 }}>
                {userLeaderboard.length ? (
                  <PlotlyChart data={userTrace} id="chart-cb-userleader" layout={{ title: 'Per-User 30-Day Cost Leaderboard' }} />
                ) : (
                  <div className="no-data">ℹ️ No user cost data available</div>
                )}
              </div>
            )}
          </div>

          {/* Incomplete clusters */}
          {incompleteClusters.length > 0 && (
            <div className="dashboard-panel">
              <div className="section-label" style={{ color: 'var(--red)', marginBottom: 8 }}>Clusters Needing Tags</div>
              <div style={{ overflowX: 'auto', maxHeight: 300 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Cluster ID</th>
                      <th>Name</th>
                      <th>Team?</th>
                      <th>Project?</th>
                      <th>Env?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incompleteClusters.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.cluster_id}</td>
                        <td style={{ fontWeight: 'bold' }}>{r.cluster_name || '—'}</td>
                        <td>{r.has_team_tag ? '✅ Yes' : '❌ No'}</td>
                        <td>{r.has_project_tag ? '✅ Yes' : '❌ No'}</td>
                        <td>{r.has_env_tag ? '✅ Yes' : '❌ No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {analyze && <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />}
        </>
      )}
    </div>
  )
}
