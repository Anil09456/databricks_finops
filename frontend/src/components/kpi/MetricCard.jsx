export default function MetricCard({ label, value, sub, accent = '#00d4ff', delta, id, info }) {
  let deltaColor = 'var(--text-lo)'
  let deltaIcon  = ''
  if (delta !== undefined && delta !== null) {
    if (delta > 0)  { deltaColor = '#ff3366'; deltaIcon = '▲ ' }
    else if (delta < 0) { deltaColor = '#00ff88'; deltaIcon = '▼ ' }
  }

  return (
    <div className="metric-card" style={{ '--accent': accent }} id={id}>
      <div className="mc-label">
        {info && (
          <span className="info-icon" title={info}>i</span>
        )}
        {label}
      </div>
      <div className="mc-value">{value ?? '—'}</div>
      {sub && <div className="mc-sub">{sub}</div>}
      {delta !== undefined && delta !== null && (
        <div className="mc-delta" style={{ color: deltaColor }}>
          {deltaIcon}{Math.abs(delta).toFixed(1)}% vs prev 7d
        </div>
      )}
    </div>
  )
}
