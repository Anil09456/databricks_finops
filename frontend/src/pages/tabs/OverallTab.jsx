import { useEffect, useState } from 'react'
import { overall as api, cache as cacheApi, analyzeAPI } from '../../api/index'
import MetricCard from '../../components/kpi/MetricCard'
import PlotlyChart from '../../components/charts/PlotlyChart'
import AnalyzePanel from '../../components/analyze/AnalyzePanel'
import {
  BarChart3, RefreshCw, Loader2, ScanSearch, Radar,
  AlertTriangle, Globe, Building2
} from 'lucide-react'
import SvgIcon from '../../components/layout/SvgIcon'

function fmt(n, prefix = '$') {
  if (n == null) return '—'
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(1)}K`
  return `${prefix}${Number(n).toFixed(0)}`
}
function pct(a, b) { return b ? ((a - b) / Math.abs(b)) * 100 : null }

export default function OverallTab({ workspaces = [], onReloadWorkspaces, loadingWorkspaces, onRadarClick, activeChartId, rightPanelOpen, onShowToast }) {
  const [workspaceId, setWorkspaceId] = useState(null)
  const [kpi,       setKpi]       = useState(null)
  const [trend,     setTrend]     = useState([])
  const [sku,       setSku]       = useState([])
  const [anomaly,   setAnomaly]   = useState([])
  const [wow,       setWow]       = useState([])
  const [loading,   setLoading]   = useState(true)
  const [analyze,   setAnalyze]   = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [k, t, s, an, w] = await Promise.all([
        api.kpi(workspaceId), api.trend(workspaceId), api.skuBreakdown(workspaceId), api.anomaly(workspaceId), api.skuWow(workspaceId),
      ])
      setKpi(k[0] || {}); setTrend(t); setSku(s); setAnomaly(an); setWow(w)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [workspaceId])

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


  const handleAnalyze = async () => {
    if (analyze) { setAnalyze(null); return }
    setAnalyzing(true)
    try {
      const anomalyCount = anomaly.filter(a => a.anomaly_level !== 'normal').length
      const res = await analyzeAPI.detect('usage_overview', {
        anomaly_count: anomalyCount,
        storage_growth: wow.some(w => w.wow_change_pct > 30) ? 1 : 0,
      })
      setAnalyze(res)
    } finally {
      setAnalyzing(false)
    }
  }

  const getCommonMetrics = () => ({
    anomaly_count: anomaly.filter(a => a.anomaly_level !== 'normal').length,
    storage_growth: wow.some(w => (w.wow_change_pct || 0) > 20) ? 1 : 0,
  })

  const k = kpi || {}
  const mtd    = k.mtd_cost ?? 0
  const cost7d = k.cost_7d  ?? 0
  const prev7d = k.cost_prev_7d ?? 0
  const delta  = pct(cost7d, prev7d)

  const trendProducts = [...new Set(trend.map(r => r.billing_origin_product))]
  const COLORS = ['#00d4ff','#00ff88','#b388ff','#ffaa00','#ff3366','#4fc3f7']

  const trendTraces = trendProducts.map((prod, i) => {
    const rows = trend.filter(r => r.billing_origin_product === prod)
    return {
      type: 'scatter', mode: 'lines', name: prod,
      x: rows.map(r => r.usage_date),
      y: rows.map(r => r.daily_cost_usd),
      line: { color: COLORS[i % COLORS.length], width: 2 },
      fill: 'tozeroy', fillcolor: `${COLORS[i % COLORS.length]}15`,
    }
  })

  const skuTrace = [{
    type: 'pie',
    labels: sku.map(r => r.billing_origin_product),
    values: sku.map(r => r.cost_usd),
    hole: 0.5,
    marker: { colors: COLORS },
    textfont: { size: 10 },
    hovertemplate: '%{label}<br>$%{value:,.0f}<extra></extra>',
  }]

  const anomalyTrace = [{
    type: 'scatter', mode: 'lines+markers', name: 'Daily Cost',
    x: anomaly.map(r => r.usage_date),
    y: anomaly.map(r => r.daily_cost),
    line: { color: '#4fc3f7' },
    marker: {
      color: anomaly.map(r => r.anomaly_level === 'critical' ? '#ff3366' : r.anomaly_level === 'high' ? '#ffaa00' : '#4fc3f7'),
      size: 7,
    },
  }, {
    type: 'scatter', mode: 'lines', name: 'Rolling Avg',
    x: anomaly.map(r => r.usage_date),
    y: anomaly.map(r => r.rolling_avg),
    line: { color: '#4a5568', dash: 'dot', width: 1.5 },
  }]

  const wowTrace = [{
    type: 'bar',
    x: wow.map(r => r.billing_origin_product),
    y: wow.map(r => r.wow_change_pct),
    marker: { color: wow.map(r => (r.wow_change_pct || 0) > 0 ? '#ff3366' : '#00ff88') },
    text: wow.map(r => `${r.wow_change_pct?.toFixed(1) ?? 0}%`),
    textposition: 'outside',
  }]

  return (
    <div>
      {/* Section header */}
      <div className="section-header-row">
        <div className="title-block">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <SvgIcon icon={BarChart3} size={16} color="var(--cyan)" />
            Overall Cost Overview
          </div>
          <div className="panel-subtitle">system.billing.usage · 90-day view · MTD + forecast</div>
        </div>
        <button className="icon-btn refresh" onClick={handleRefresh} disabled={refreshing} id="btn-overall-refresh"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SvgIcon icon={refreshing ? Loader2 : RefreshCw} size={13} color="currentColor" className={refreshing ? 'lucide-spin' : ''} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className={`icon-btn analyze ${analyze ? 'active' : ''}`}
          onClick={handleAnalyze} disabled={analyzing} id="btn-overall-analyze"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SvgIcon icon={analyzing ? Loader2 : ScanSearch} size={13} color="currentColor" className={analyzing ? 'lucide-spin' : ''} />
          Analyze
        </button>
        <button
          className={`icon-btn radar-section-btn ${rightPanelOpen && !activeChartId ? 'active' : ''}`}
          onClick={() => onRadarClick(null, null)}
          title="Open AI Insights Panel"
          id="btn-overall-radar"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <SvgIcon icon={Radar} size={13} color="currentColor" />
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
              flexShrink: 0
            }}
            title="Load/Refresh Workspaces"
          >
            <SvgIcon icon={loadingWorkspaces ? Loader2 : RefreshCw} size={14} color="currentColor" className={loadingWorkspaces ? 'lucide-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner" /><span>Loading usage data…</span></div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="kpi-row">
            <MetricCard id="kpi-mtd-cost"     label="MTD Cost"          value={fmt(mtd)}                   accent="#00d4ff" info="Total Databricks spend MTD across all SKUs." />
            <MetricCard id="kpi-cost-7d"      label="Last 7 Days"       value={fmt(cost7d)}  delta={delta} accent="#b388ff" info="Total spend in the last 7 days (and week-over-week cost change)." />
            <MetricCard id="kpi-mtd-dbus"     label="MTD DBUs"          value={(k.mtd_dbus || 0).toFixed(0)} sub="DBUs" accent="#00ff88" info="Total DBUs consumed MTD." />
            <MetricCard id="kpi-projected"    label="Projected Monthly"  value={fmt(k.projected_monthly || 0)} accent="#ffaa00" info="Estimated end-of-month total." />
            <MetricCard id="kpi-forecast"     label="Month Forecast"     value={fmt(k.forecasted_month_total || 0)} accent="#ff3366" info="AI forecasted cost for the active calendar month." />
          </div>

          {/* WoW alerts */}
          {wow.some(w => (w.wow_change_pct || 0) > 30) && (
            <div className="no-data" style={{ borderLeftColor: '#ffaa00', color: '#ffaa00', display: 'flex', alignItems: 'center', gap: 7 }}>
              <SvgIcon icon={AlertTriangle} size={14} color="#ffaa00" />
              One or more products spiked &gt;30% WoW — check the chart below
            </div>
          )}

          {/* Charts row */}
          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">Daily Cost by Product (90 days)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Tracks daily DBU spend broken down by Databricks product over 90 days.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'daily_cost_product' ? 'active' : ''}`}
                    onClick={() => onRadarClick('daily_cost_product', getCommonMetrics())}
                    title="Analyze this chart for anomalies"
                  >
                    <SvgIcon icon={Radar} size={13} color="currentColor" />
                  </button>
                </div>
              </div>
              <PlotlyChart data={trendTraces} id="chart-daily-trend"
                layout={{ yaxis: { tickprefix: '$' }, showlegend: true }} />
            </div>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">Spend by Product (30 days)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Donut breakdown of MTD spend by product workload type.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'spend_by_product' ? 'active' : ''}`}
                    onClick={() => onRadarClick('spend_by_product', getCommonMetrics())}
                    title="Analyze this chart for anomalies"
                  >
                    📡
                  </button>
                </div>
              </div>
              <PlotlyChart data={skuTrace} id="chart-sku-donut"
                layout={{ showlegend: true, margin: { t: 20, r: 0, b: 20, l: 0 } }} />
            </div>
          </div>

          <div className="grid-2">
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">Cost Anomaly Detection (14 days)</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="14-day rolling anomaly band — flags spend exceeding 1.3x trailing 7-day average.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'cost_anomaly_detect' ? 'active' : ''}`}
                    onClick={() => onRadarClick('cost_anomaly_detect', getCommonMetrics())}
                    title="Analyze this chart for anomalies"
                  >
                    📡
                  </button>
                </div>
              </div>
              <PlotlyChart data={anomalyTrace} id="chart-anomaly"
                layout={{ yaxis: { tickprefix: '$' }, showlegend: true }} />
            </div>
            <div className="dashboard-panel" style={{ margin: 0 }}>
              <div className="chart-header-row">
                <div className="section-label">SKU Week-over-Week Change</div>
                <div className="chart-header-actions">
                  <span className="info-btn" title="Week-over-week cost change heatmap by Databricks SKU product line.">ⓘ</span>
                  <button
                    className={`radar-btn ${activeChartId === 'sku_wow_heatmap' ? 'active' : ''}`}
                    onClick={() => onRadarClick('sku_wow_heatmap', getCommonMetrics())}
                    title="Analyze this chart for anomalies"
                  >
                    📡
                  </button>
                </div>
              </div>
              <PlotlyChart data={wowTrace} id="chart-wow"
                layout={{ yaxis: { ticksuffix: '%', zeroline: true } }} />
            </div>
          </div>

          {analyze && (
            <AnalyzePanel result={analyze} onClose={() => setAnalyze(null)} />
          )}
        </>
      )}
    </div>
  )
}
