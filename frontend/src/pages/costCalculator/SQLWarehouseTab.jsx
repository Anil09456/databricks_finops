// SQLWarehouseTab.jsx
import { SQL_WAREHOUSE_TYPES, SQL_SIZES_BY_TYPE, SQL_WORKER_COUNTS, SQL_RATES_BY_TYPE } from './costCalculatorData'
import { calculateSQLWarehouseCosts } from './calculations'

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function SQLWarehouseTab({ sqlWarehouses, setSqlWarehouses }) {
  const { enriched, totalDbuCost, totalEc2Cost } = calculateSQLWarehouseCosts(sqlWarehouses)
  const totalCost = totalDbuCost + totalEc2Cost

  function updateWarehouse(id, field, value) {
    setSqlWarehouses(prev => prev.map(w => w.id === id ? { ...w, [field]: value } : w))
  }

  function addWarehouse() {
    const newId = `warehouse_${Date.now()}`
    setSqlWarehouses(prev => [...prev, {
      id: newId, name: 'New Warehouse',
      computeType: 'SQL Compute', size: '2X-Small',
      nodes: 1, hoursPerDay: 0, daysPerMonth: 0,
      autoSuspend: true, suspendAfter: 10,
    }])
  }

  function deleteWarehouse(id) {
    setSqlWarehouses(prev => prev.filter(w => w.id !== id))
  }

  return (
    <div>
      <div className="cc-tab-header">
        <h2 className="cc-tab-title">🏭 Databricks SQL Warehouse Costs</h2>
      </div>

      {/* Summary KPIs */}
      <div className="cc-kpi-row">
        <div className="cc-kpi-card" style={{ '--kpi-accent': 'var(--cyan)' }}>
          <div className="cc-kpi-label">Total Cost / Month</div>
          <div className="cc-kpi-value">{fmt(totalCost)}</div>
          <div className="cc-kpi-sub">{sqlWarehouses.length} warehouse(s) configured</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#b388ff' }}>
          <div className="cc-kpi-label">DBU Cost</div>
          <div className="cc-kpi-value">{fmt(totalDbuCost)}</div>
          <div className="cc-kpi-sub">Auto-calculated</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#00ff88' }}>
          <div className="cc-kpi-label">EC2 Cost</div>
          <div className="cc-kpi-value">{fmt(totalEc2Cost)}</div>
          <div className="cc-kpi-sub">Auto-calculated</div>
        </div>
      </div>

      {/* Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="cc-btn-primary" onClick={addWarehouse}>＋ Add SQL Warehouse</button>
      </div>

      {sqlWarehouses.length === 0 && (
        <div className="cc-empty-state">No SQL Warehouses configured. Click '＋ Add SQL Warehouse' to start.</div>
      )}

      {/* Warehouse Cards */}
      {enriched.map((wh, i) => {
        const sizes = SQL_SIZES_BY_TYPE[wh.computeType] || []
        const maxNodes = SQL_WORKER_COUNTS[wh.size] || 1
        const rates = (SQL_RATES_BY_TYPE[wh.computeType] || {})[wh.size] || {}
        const whTotal = (wh.dbuCost || 0) + (wh.ec2Cost || 0)

        return (
          <div key={wh.id} className="cc-section-card">
            {/* Card header */}
            <div className="cc-section-header" style={{ cursor: 'default' }}>
              <div className="cc-section-header-left">
                <span className="cc-tier-badge" style={{ background: 'rgba(79,195,247,0.15)', color: '#4fc3f7' }}>
                  Warehouse {i + 1}
                </span>
                <span className="cc-wh-name">{wh.name}</span>
                <span className="cc-section-meta">
                  {rates.dbuPerHour || 0} DBUs · ${rates.ratePerHour || 0}/hr · {wh.hoursPerDay}h/day · {wh.daysPerMonth} days/mo
                  · <strong style={{ color: 'var(--cyan)' }}>Total: {fmt(whTotal)}</strong>
                </span>
              </div>
              <button className="cc-btn-del" style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
                onClick={() => deleteWarehouse(wh.id)}>🗑️ Delete</button>
            </div>
            <div className="cc-section-body">
              <div className="cc-wh-grid">
                {/* Name */}
                <div className="cc-field">
                  <label className="cc-label">Warehouse Name</label>
                  <input className="cc-input" value={wh.name}
                    onChange={e => updateWarehouse(wh.id, 'name', e.target.value)} />
                </div>
                {/* Compute Type */}
                <div className="cc-field">
                  <label className="cc-label">Compute Type</label>
                  <select className="cc-select" value={wh.computeType}
                    onChange={e => {
                      const ct = e.target.value
                      const firstSize = (SQL_SIZES_BY_TYPE[ct] || [])[0] || '2X-Small'
                      updateWarehouse(wh.id, 'computeType', ct)
                      updateWarehouse(wh.id, 'size', firstSize)
                    }}>
                    {SQL_WAREHOUSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                {/* Size */}
                <div className="cc-field">
                  <label className="cc-label">Instance Size</label>
                  <select className="cc-select" value={wh.size}
                    onChange={e => updateWarehouse(wh.id, 'size', e.target.value)}>
                    {sizes.map(s => {
                      const r = (SQL_RATES_BY_TYPE[wh.computeType] || {})[s] || {}
                      return <option key={s} value={s}>{s} — {r.dbuPerHour || 0} DBUs — ${r.ratePerHour || 0}/hr</option>
                    })}
                  </select>
                </div>
                {/* Nodes */}
                <div className="cc-field">
                  <label className="cc-label">Nodes (max: {maxNodes})</label>
                  <input type="number" min="0" max={maxNodes} className="cc-input cc-input-num"
                    value={Math.min(wh.nodes, maxNodes)}
                    onChange={e => updateWarehouse(wh.id, 'nodes', Math.min(parseInt(e.target.value) || 1, maxNodes))} />
                </div>
                {/* Hours/day */}
                <div className="cc-field">
                  <label className="cc-label">Hours / Day</label>
                  <input type="number" min="0" max="24" step="0.5" className="cc-input cc-input-num"
                    value={wh.hoursPerDay}
                    onChange={e => updateWarehouse(wh.id, 'hoursPerDay', parseFloat(e.target.value) || 0)} />
                </div>
                {/* Days/month */}
                <div className="cc-field">
                  <label className="cc-label">Days / Month</label>
                  <input type="number" min="0" max="31" className="cc-input cc-input-num"
                    value={wh.daysPerMonth}
                    onChange={e => updateWarehouse(wh.id, 'daysPerMonth', parseInt(e.target.value) || 0)} />
                </div>
              </div>

              {/* Per-warehouse cost mini summary */}
              <div className="cc-wh-cost-row">
                <div className="cc-wh-cost-item"><span>DBU Cost</span><strong>{fmt(wh.dbuCost)}</strong></div>
                <div className="cc-wh-cost-item"><span>EC2 Cost</span><strong>{fmt(wh.ec2Cost)}</strong></div>
                <div className="cc-wh-cost-item cc-wh-total"><span>Total</span><strong>{fmt(whTotal)}</strong></div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
