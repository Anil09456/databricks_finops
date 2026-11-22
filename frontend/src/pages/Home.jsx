import { useEffect, useState } from 'react'
import { overall as api, cache as cacheApi } from '../api/index'
import PlotlyChart from '../components/charts/PlotlyChart'
import {
  Compass, BarChart3, SearchCheck, Cpu, Calculator,
  TrendingUp, RefreshCw, Loader2, Database, Info
} from 'lucide-react'
import SvgIcon from '../components/layout/SvgIcon'

export default function Home({ onNavigate, onShowToast }) {
  const [wsCost, setWsCost] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewLevel, setViewLevel] = useState('Overall Account')
  const [selectedWorkspace, setSelectedWorkspace] = useState('All Workspaces')
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.workspaceCost()
      setWsCost(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await cacheApi.invalidate('overall')
      await load()
      if (onShowToast) onShowToast("Dashboards are refreshed!")
    } finally {
      setRefreshing(false)
    }
  }

  // ── Data separation ───────────────────────────────────────
  const sortedData = [...wsCost].sort((a, b) => a.month.localeCompare(b.month))
  const uniqueMonths = [...new Set(sortedData.map(r => r.month_str))]

  // Metastore is the "Account Level" workspace_id from the backend COALESCE
  const metastoreData    = sortedData.filter(r => r.workspace_id === 'Account Level')
  const workspaceOnlyData = sortedData.filter(r => r.workspace_id !== 'Account Level')

  // Distinct workspaces available for the dropdown (no Account Level)
  const availableWorkspaces = [...new Set(workspaceOnlyData.map(r => r.workspace_id))]

  const firstForecastRow = sortedData.find(r => r.cost_type === 'Forecast')
  const firstForecastMonth = firstForecastRow ? firstForecastRow.month_str : null

  const palette = ['#00d4ff', '#b388ff', '#00ff88', '#ffaa00', '#ff3366']

  // ── Build chart traces ────────────────────────────────────
  let traces = []

  if (viewLevel === 'Overall Account') {
    // Sum all real workspace costs per month
    const monthCostMap = {}
    workspaceOnlyData.forEach(r => {
      const key = `${r.month_str}_${r.cost_type}`
      monthCostMap[key] = (monthCostMap[key] || 0) + Number(r.cost_usd || 0)
    })

    traces.push({
      name: 'Account (Actual)',
      type: 'bar',
      x: uniqueMonths,
      y: uniqueMonths.map(m => monthCostMap[`${m}_Actual`] || 0),
      marker: { color: '#00d4ff' },
      hovertemplate: '<b>%{x}</b><br>Actual: $%{y:,.2f}<extra></extra>'
    })
    traces.push({
      name: 'Account (AI Forecast)',
      type: 'bar',
      x: uniqueMonths,
      y: uniqueMonths.map(m => monthCostMap[`${m}_Forecast`] || 0),
      marker: { color: '#00d4ff', opacity: 0.55 },
      hovertemplate: '<b>%{x}</b><br>Forecast: $%{y:,.2f}<extra></extra>'
    })

    // ── Metastore series (moved here from workspace level) ──
    if (metastoreData.length > 0) {
      traces.push({
        name: 'Metastore (Actual)',
        type: 'bar',
        x: uniqueMonths,
        y: uniqueMonths.map(m => {
          const row = metastoreData.find(r => r.month_str === m && r.cost_type === 'Actual')
          return row ? Number(row.cost_usd || 0) : 0
        }),
        marker: { color: '#b388ff' },
        hovertemplate: '<b>%{x}</b><br>Metastore Actual: $%{y:,.2f}<extra></extra>'
      })
      traces.push({
        name: 'Metastore (AI Forecast)',
        type: 'bar',
        x: uniqueMonths,
        y: uniqueMonths.map(m => {
          const row = metastoreData.find(r => r.month_str === m && r.cost_type === 'Forecast')
          return row ? Number(row.cost_usd || 0) : 0
        }),
        marker: { color: '#b388ff', opacity: 0.55 },
        hovertemplate: '<b>%{x}</b><br>Metastore Forecast: $%{y:,.2f}<extra></extra>'
      })
    }
  } else {
    // ── Workspace Level — respect dropdown selection ──────
    const workspacesToShow =
      selectedWorkspace === 'All Workspaces'
        ? availableWorkspaces
        : [selectedWorkspace]

    workspacesToShow.forEach((ws, idx) => {
      const color = palette[idx % palette.length]
      const wsData = workspaceOnlyData.filter(r => r.workspace_id === ws)

      traces.push({
        name: `${ws} (Actual)`,
        type: 'bar',
        x: uniqueMonths,
        y: uniqueMonths.map(m => {
          const row = wsData.find(r => r.month_str === m && r.cost_type === 'Actual')
          return row ? Number(row.cost_usd || 0) : 0
        }),
        marker: { color },
        hovertemplate: '<b>%{x}</b><br>Actual: $%{y:,.2f}<extra></extra>'
      })
      traces.push({
        name: `${ws} (Forecast)`,
        type: 'bar',
        x: uniqueMonths,
        y: uniqueMonths.map(m => {
          const row = wsData.find(r => r.month_str === m && r.cost_type === 'Forecast')
          return row ? Number(row.cost_usd || 0) : 0
        }),
        marker: { color, opacity: 0.55 },
        hovertemplate: '<b>%{x}</b><br>Forecast: $%{y:,.2f}<extra></extra>'
      })
    })
  }

  // ── Chart layout ──────────────────────────────────────────
  const layout = {
    barmode: 'stack',
    showlegend: true,
    legend: { orientation: 'h', y: -0.2, x: 0 },
    yaxis: { title: 'Cost (USD)', tickprefix: '$' },
    shapes: firstForecastMonth ? [{
      type: 'line',
      x0: firstForecastMonth, x1: firstForecastMonth,
      y0: 0, y1: 1,
      xref: 'x', yref: 'paper',
      line: { color: '#00d4ff', width: 2, dash: 'dash' }
    }] : [],
    annotations: firstForecastMonth ? [{
      x: firstForecastMonth, y: 1,
      xref: 'x', yref: 'paper',
      text: '← Actuals | AI Forecast →',
      showarrow: false, yshift: 10,
      font: { size: 10, color: '#00d4ff' }
    }] : []
  }

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="home-hero" style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '40px 30px',
        textAlign: 'center',
        marginBottom: 30
      }}>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 38,
          color: 'var(--text-hi)',
          marginBottom: 12,
          fontWeight: 800
        }}>
          FinOps Copilot
        </h1>
        <p style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          color: 'var(--text-mid)',
          maxWidth: 700,
          margin: '0 auto',
          lineHeight: 1.6
        }}>
          Your centralized AI-driven command center for Databricks cost management.
          Navigate between usage dashboards, AI diagnosis tools, module libraries, and track optimization savings all in one place.
        </p>
      </div>

      {/* ── Quick Nav ─────────────────────────────────────── */}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: '#8892a4',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }}>
        <SvgIcon icon={Compass} size={13} color="#8892a4" />
        Quick Navigation
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 30 }}>
        <button className="nav-card-btn" onClick={() => onNavigate('command-centre')}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            <SvgIcon icon={BarChart3} size={28} color="var(--cyan)" strokeWidth={1.5} />
          </div>
          <strong>Command Centre</strong>
          <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>View KPIs &amp; Dashboards</div>
        </button>
        <button className="nav-card-btn" onClick={() => onNavigate('cost-lookup')}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            <SvgIcon icon={SearchCheck} size={28} color="var(--cyan)" strokeWidth={1.5} />
          </div>
          <strong>Cost Lookup</strong>
          <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>Job · Cluster · User cost</div>
        </button>
        <button className="nav-card-btn" onClick={() => onNavigate('run-intelligence')}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            <SvgIcon icon={Cpu} size={28} color="var(--cyan)" strokeWidth={1.5} />
          </div>
          <strong>Run Intelligence</strong>
          <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>Multi-source AI Analyzer</div>
        </button>
        <button className="nav-card-btn" onClick={() => onNavigate('cost-calculator')}>
          <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
            <SvgIcon icon={Calculator} size={28} color="var(--cyan)" strokeWidth={1.5} />
          </div>
          <strong>Cost Calculator</strong>
          <div style={{ fontSize: 11, color: '#8892a4', marginTop: 4 }}>Databricks &amp; AWS Estimator</div>
        </button>
      </div>

      <hr style={{ margin: '30px 0', borderColor: 'var(--border)' }} />

      {/* ── Chart Section Header ───────────────────────────── */}
      <div className="section-header-row" style={{ marginBottom: 12 }}>
        <div className="title-block" style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          color: '#8892a4',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <SvgIcon icon={TrendingUp} size={13} color="#8892a4" />
          Workspace Cost Forecast (6mo Actuals + 3mo AI Projection)
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <SvgIcon icon={refreshing ? Loader2 : RefreshCw} size={13} color="currentColor" className={refreshing ? 'lucide-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Chart ─────────────────────────────────────────── */}
      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /><span>Loading AI forecast data…</span></div>
      ) : (
        <div className="dashboard-panel" style={{ padding: 16 }}>

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>

            {/* Radio — Overall Account */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="viewLevel"
                checked={viewLevel === 'Overall Account'}
                onChange={() => setViewLevel('Overall Account')}
              />
              <span style={{ fontSize: 13 }}>Overall Account</span>
            </label>

            {/* Radio — Workspace Level */}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="viewLevel"
                checked={viewLevel === 'Workspace Level'}
                onChange={() => {
                  setViewLevel('Workspace Level')
                  setSelectedWorkspace('All Workspaces')
                }}
              />
              <span style={{ fontSize: 13 }}>Workspace Level</span>
            </label>

            {/* Workspace dropdown — only visible in Workspace Level mode */}
            {viewLevel === 'Workspace Level' && availableWorkspaces.length > 0 && (
              <select
                id="workspace-selector"
                className="select"
                value={selectedWorkspace}
                onChange={e => setSelectedWorkspace(e.target.value)}
                style={{ width: 'auto', minWidth: 200, fontSize: 13 }}
              >
                <option value="All Workspaces">All Workspaces</option>
                {availableWorkspaces.map(ws => (
                  <option key={ws} value={ws}>{ws}</option>
                ))}
              </select>
            )}

            {/* Metastore hint in Overall Account mode */}
            {viewLevel === 'Overall Account' && metastoreData.length > 0 && (
              <span style={{
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#b388ff',
                background: 'rgba(179,136,255,0.08)',
                border: '1px solid rgba(179,136,255,0.25)',
                borderRadius: 4,
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <SvgIcon icon={Database} size={11} color="#b388ff" />
                Metastore shown separately
              </span>
            )}
          </div>

          {wsCost.length ? (
            <PlotlyChart data={traces} id="chart-home-forecast" layout={layout} style={{ minHeight: 400 }} />
          ) : (
            <div className="no-data" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SvgIcon icon={Info} size={14} color="currentColor" />
              No workspace cost data available for the last 30 days.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
