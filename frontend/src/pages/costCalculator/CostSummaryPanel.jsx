// CostSummaryPanel.jsx
import PlotlyChart from '../../components/charts/PlotlyChart'

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function CostSummaryPanel({ totals, dbxTotal, s3Cost, sqlTotal, devTotal, tableBasedCost }) {
  const costData = [
    { label: 'Databricks & Compute', value: dbxTotal,     color: '#FF8C00' },
    { label: 'S3 Storage',           value: s3Cost,        color: '#3CB371' },
    { label: 'SQL Warehouse',        value: sqlTotal,      color: '#1E90FF' },
    { label: 'Development Cost',     value: devTotal,      color: '#E6ADB3' },
    { label: 'S3 Table-Based',       value: tableBasedCost,color: '#B2E6AD' },
  ].filter(d => d.value > 0)

  const donutData = [{
    type: 'pie',
    hole: 0.6,
    labels: costData.map(d => d.label),
    values: costData.map(d => d.value),
    marker: { colors: costData.map(d => d.color) },
    hoverinfo: 'label+percent+value',
    textinfo: 'percent',
    textfont: { size: 13, color: '#e2e8f0' },
  }]

  const donutLayout = {
    showlegend: true,
    legend: { orientation: 'h', yanchor: 'bottom', y: -0.3, xanchor: 'center', x: 0.5, font: { size: 10 } },
    margin: { t: 0, b: 0, l: 0, r: 0 },
    height: 220,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#8892a4' },
  }

  const summaryRows = [
    { label: 'Monthly Total', value: totals.monthly, accent: 'var(--cyan)' },
    { label: 'Quarterly Total', value: totals.quarterly, accent: '#b388ff' },
    { label: 'Half-Yearly Total', value: totals.halfYearly, accent: '#00ff88' },
    { label: 'Yearly Total', value: totals.yearly, accent: '#ffaa00' },
  ]

  return (
    <div className="cc-summary-panel">
      <div className="cc-summary-title">☁️ Total Cost</div>

      {/* Cost Metrics */}
      <div className="cc-summary-metrics">
        {summaryRows.map(r => (
          <div key={r.label} className="cc-summary-metric" style={{ '--metric-accent': r.accent }}>
            <div className="cc-summary-metric-label">{r.label}</div>
            <div className="cc-summary-metric-value">{fmt(r.value)}</div>
          </div>
        ))}
      </div>

      <div className="cc-summary-divider" />

      {/* Donut Chart */}
      <div className="cc-summary-section-label">Cost Distribution</div>
      {costData.length > 0 ? (
        <PlotlyChart data={donutData} id="chart-cost-donut" layout={donutLayout} style={{ minHeight: 220 }} />
      ) : (
        <div className="cc-empty-state" style={{ padding: '24px 12px', fontSize: 12 }}>
          ℹ️ No costs configured yet
        </div>
      )}

      <div className="cc-summary-divider" />

      {/* Cost breakdown list */}
      <div className="cc-summary-section-label">Cost Breakdown</div>
      <div className="cc-breakdown-list">
        {[
          { label: 'Databricks & Compute', value: dbxTotal, color: '#FF8C00' },
          { label: 'S3 Storage',           value: s3Cost + tableBasedCost, color: '#3CB371' },
          { label: 'SQL Warehouse',        value: sqlTotal, color: '#1E90FF' },
          { label: 'Development Cost',     value: devTotal, color: '#E6ADB3' },
        ].map(item => (
          <div key={item.label} className="cc-breakdown-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="cc-breakdown-dot" style={{ background: item.color }} />
              <span className="cc-breakdown-label">{item.label}</span>
            </div>
            <span className="cc-breakdown-value">{fmt(item.value)}</span>
          </div>
        ))}
      </div>

      <div className="cc-summary-divider" />

      {/* Cost Insights */}
      <div className="cc-summary-section-label">💡 Cost Insights</div>
      <div className="cc-insights">
        <div className="cc-insight-item">
          <span className="cc-insight-icon">⚡</span>
          <span>Consider <strong>spot instances</strong> for non-critical workloads to save ~70% on EC2.</span>
        </div>
        <div className="cc-insight-item">
          <span className="cc-insight-icon">⏸</span>
          <span>Enable <strong>auto-suspend</strong> for SQL warehouses to avoid paying for idle compute.</span>
        </div>
        <div className="cc-insight-item">
          <span className="cc-insight-icon">🗄️</span>
          <span>Use appropriate <strong>S3 storage classes</strong> (Glacier, IA) for cold/infrequent data.</span>
        </div>
      </div>
    </div>
  )
}
