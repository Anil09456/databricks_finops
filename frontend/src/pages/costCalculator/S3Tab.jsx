// S3Tab.jsx
import { S3_STORAGE_CLASSES } from './costCalculatorData'
import { calculateS3DirectCosts, calculateS3TableCosts } from './calculations'

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const DIRECT_ZONES = ['Landing Zone', 'Stage', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']
const TABLE_ZONES  = ['Source System Table', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']

export default function S3Tab({ s3CalcMethod, setS3CalcMethod, s3Direct, setS3Direct, s3TableBased, setS3TableBased, enableS3Stage, setEnableS3Stage }) {

  const s3Results      = calculateS3DirectCosts(s3Direct, enableS3Stage)
  const s3TableResults = calculateS3TableCosts(s3TableBased)

  // ── Direct Storage helpers ─────────────────────────────────────────────────
  function updateDirect(zone, field, value) {
    setS3Direct(prev => ({ ...prev, [zone]: { ...prev[zone], [field]: value } }))
  }

  const activeDirectZones = enableS3Stage ? DIRECT_ZONES : DIRECT_ZONES.filter(z => z !== 'Stage')

  // ── Table-Based helpers ────────────────────────────────────────────────────
  function updateTableRow(zone, idx, field, value) {
    setS3TableBased(prev => ({
      ...prev,
      [zone]: prev[zone].map((r, i) => i === idx ? { ...r, [field]: value } : r)
    }))
  }

  function addTableRow(zone) {
    setS3TableBased(prev => ({
      ...prev,
      [zone]: [...(prev[zone] || []), {
        tableName: `Table_${(prev[zone]?.length || 0) + 1}`, records: 0, columns: 0, numTables: 0, avgColumnLength: 0
      }]
    }))
  }

  function deleteTableRow(zone, idx) {
    setS3TableBased(prev => ({
      ...prev,
      [zone]: prev[zone].filter((_, i) => i !== idx)
    }))
  }

  return (
    <div>
      <div className="cc-tab-header">
        <h2 className="cc-tab-title">🗄️ AWS S3 Storage Costs</h2>
      </div>

      {/* Calculation Method Radio */}
      <div className="cc-radio-group">
        {['Direct Storage', 'Table-Based'].map(m => (
          <label key={m} className={`cc-radio-btn ${s3CalcMethod === m ? 'active' : ''}`}>
            <input type="radio" name="s3method" value={m} checked={s3CalcMethod === m} onChange={() => setS3CalcMethod(m)} />
            {m === 'Direct Storage' ? '📦 Direct Storage (Recommended)' : '📋 Table-Based'}
          </label>
        ))}
      </div>

      {/* ── Direct Storage ──────────────────────────────────────────────────── */}
      {s3CalcMethod === 'Direct Storage' && (
        <div>
          <p className="cc-tab-desc"><strong>Monthly Storage Cost</strong> is determined by Total Storage in GB × Tiered Rate.</p>

          {/* Total projections */}
          <div className="cc-kpi-row" style={{ marginTop: 16 }}>
            <div className="cc-kpi-card" style={{ '--kpi-accent': 'var(--cyan)' }}>
              <div className="cc-kpi-label">Total Monthly</div>
              <div className="cc-kpi-value">{fmt(s3Results.totalMonthly)}</div>
            </div>
            <div className="cc-kpi-card" style={{ '--kpi-accent': '#b388ff' }}>
              <div className="cc-kpi-label">Total Quarterly</div>
              <div className="cc-kpi-value">{fmt(s3Results.totalQuarterly)}</div>
            </div>
            <div className="cc-kpi-card" style={{ '--kpi-accent': '#00ff88' }}>
              <div className="cc-kpi-label">Total Half-Yearly</div>
              <div className="cc-kpi-value">{fmt(s3Results.totalHalfYearly)}</div>
            </div>
            <div className="cc-kpi-card" style={{ '--kpi-accent': '#ffaa00' }}>
              <div className="cc-kpi-label">Total Yearly</div>
              <div className="cc-kpi-value">{fmt(s3Results.totalYearly)}</div>
            </div>
          </div>

          {/* Stage toggle */}
          <label className="cc-toggle-row" style={{ marginTop: 12 }}>
            <div className={`cc-toggle ${enableS3Stage ? 'on' : ''}`} onClick={() => setEnableS3Stage(v => !v)}>
              <div className="cc-toggle-thumb" />
            </div>
            <span className="cc-toggle-label">Enable Stage Tier</span>
          </label>

          {/* Zone cards */}
          {activeDirectZones.map(zone => {
            const cfg = s3Direct[zone] || { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 }
            const zr  = s3Results.perZone[zone] || { monthlyCost: 0, quarterly: 0, halfYearly: 0, yearly: 0 }
            return (
              <div key={zone} className="cc-section-card">
                <div className="cc-section-header" style={{ cursor: 'default' }}>
                  <span className="cc-tier-badge">{zone}</span>
                  <span className="cc-section-meta">Monthly: {fmt(zr.monthlyCost)}</span>
                </div>
                <div className="cc-section-body">
                  {/* Zone metrics */}
                  <div className="cc-zone-metrics">
                    <div className="cc-zone-metric"><span>Monthly</span><strong>{fmt(zr.monthlyCost)}</strong></div>
                    <div className="cc-zone-metric"><span>Quarterly</span><strong>{fmt(zr.quarterly)}</strong></div>
                    <div className="cc-zone-metric"><span>Half-Yearly</span><strong>{fmt(zr.halfYearly)}</strong></div>
                    <div className="cc-zone-metric"><span>Yearly</span><strong>{fmt(zr.yearly)}</strong></div>
                  </div>
                  <div className="cc-zone-inputs">
                    <div className="cc-field">
                      <label className="cc-label">Storage Class</label>
                      <select className="cc-select" value={cfg.storageClass} onChange={e => updateDirect(zone, 'storageClass', e.target.value)}>
                        {S3_STORAGE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="cc-field">
                      <label className="cc-label">Storage Amount</label>
                      <input type="number" min="0" className="cc-input" value={cfg.amount}
                        onChange={e => updateDirect(zone, 'amount', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="cc-field">
                      <label className="cc-label">Unit</label>
                      <select className="cc-select" value={cfg.unit} onChange={e => updateDirect(zone, 'unit', e.target.value)}>
                        <option>GB</option><option>TB</option>
                      </select>
                    </div>
                    <div className="cc-field">
                      <label className="cc-label">Monthly Growth %</label>
                      <input type="number" min="0" max="100" step="0.1" className="cc-input" value={cfg.growthPercent}
                        onChange={e => updateDirect(zone, 'growthPercent', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Table-Based ─────────────────────────────────────────────────────── */}
      {s3CalcMethod === 'Table-Based' && (
        <div>
          <p className="cc-tab-desc">
            Estimated GB = (Records × Columns × Avg_Column_length × bpc × cr) ÷ 1024³<br />
            <span style={{ fontSize: 11, opacity: 0.7 }}>defaults: bpc=1, cr=0.5 · Standard rate: $0.023/GB</span>
          </p>

          {TABLE_ZONES.map(zone => {
            const tables = s3TableBased[zone] || []
            const { perZone } = calculateS3TableCosts(s3TableBased)
            const zoneCost = perZone[zone] || 0
            return (
              <div key={zone} className="cc-section-card">
                <div className="cc-section-header" style={{ cursor: 'default' }}>
                  <span className="cc-tier-badge">{zone}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="cc-section-meta">Estimated Cost: {fmt(zoneCost)}</span>
                    <button className="cc-btn-sm cc-btn-add" onClick={() => addTableRow(zone)}>＋ Add Table</button>
                  </div>
                </div>
                <div className="cc-section-body">
                  <div className="cc-table-wrap">
                    <table className="cc-table">
                      <thead>
                        <tr>
                          <th>Table Name</th>
                          <th>Records</th>
                          <th>Columns</th>
                          <th>Num Tables</th>
                          <th>Avg Column Length</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tables.map((tbl, idx) => (
                          <tr key={idx}>
                            <td>
                              <input className="cc-input" value={tbl.tableName}
                                onChange={e => updateTableRow(zone, idx, 'tableName', e.target.value)} />
                            </td>
                            {['records', 'columns', 'numTables', 'avgColumnLength'].map(f => (
                              <td key={f}>
                                <input type="number" min="0" className="cc-input cc-input-num" value={tbl[f]}
                                  onChange={e => updateTableRow(zone, idx, f, parseInt(e.target.value) || 0)} />
                              </td>
                            ))}
                            <td>
                              <button className="cc-btn-del" onClick={() => deleteTableRow(zone, idx)}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="cc-total-banner">
            <span>Total S3 Table-Based Cost</span>
            <strong>{fmt(s3TableResults.totalCost)}/month</strong>
          </div>
        </div>
      )}
    </div>
  )
}
