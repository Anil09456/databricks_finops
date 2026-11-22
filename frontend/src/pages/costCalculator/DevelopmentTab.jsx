// DevelopmentTab.jsx
import { DEV_INSTANCE_OPTIONS } from './costCalculatorData'
import { calculateDevCosts } from './calculations'

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function DevelopmentTab({ devCosts, setDevCosts }) {
  const { enriched, totalDbxCost, totalEc2Cost } = calculateDevCosts(devCosts)

  const instanceKeys = DEV_INSTANCE_OPTIONS.map(r => r.instance)
  const firstInstance = instanceKeys[0] || null

  function updateRow(id, field, value) {
    setDevCosts(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setDevCosts(prev => [...prev, {
      id: `dev_${Date.now()}`,
      computeType: 'All-Purpose Compute',
      driverType: firstInstance,
      workerType: firstInstance,
      nodes: 1, hrPerMonth: 0, numMonths: 0,
    }])
  }

  function deleteRow(id) {
    setDevCosts(prev => prev.filter(r => r.id !== id))
  }

  return (
    <div>
      <div className="cc-tab-header">
        <h2 className="cc-tab-title">🛠️ Development &amp; All-Purpose Compute</h2>
        <p className="cc-tab-desc">
          <strong>Development Cost</strong> is an estimate for All-Purpose Compute clusters.
          It combines the DBU and EC2 costs for both the driver and worker nodes,
          multiplied by the total hours used per month.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="cc-kpi-row">
        <div className="cc-kpi-card" style={{ '--kpi-accent': 'var(--cyan)' }}>
          <div className="cc-kpi-label">Total DBX Cost</div>
          <div className="cc-kpi-value">{fmt(totalDbxCost)}</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#00ff88' }}>
          <div className="cc-kpi-label">Total EC2 Cost</div>
          <div className="cc-kpi-value">{fmt(totalEc2Cost)}</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#ffaa00' }}>
          <div className="cc-kpi-label">Grand Total</div>
          <div className="cc-kpi-value">{fmt(totalDbxCost + totalEc2Cost)}</div>
        </div>
      </div>

      {/* Add Row button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="cc-btn-primary" onClick={addRow}>＋ Add Row</button>
      </div>

      {/* Editable table */}
      <div className="cc-section-card">
        <div className="cc-table-wrap">
          <table className="cc-table">
            <thead>
              <tr>
                <th>Compute Type</th>
                <th>Driver Type</th>
                <th>Worker Type</th>
                <th>Worker Nodes</th>
                <th>Hours / Month</th>
                <th>Num Months</th>
                <th>DBX Cost ($)</th>
                <th>EC2 Cost ($)</th>
                <th>Total ($)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enriched.map(row => (
                <tr key={row.id}>
                  <td>
                    <span className="cc-compute-badge">All-Purpose Compute</span>
                  </td>
                  <td>
                    <select className="cc-select" value={row.driverType || ''} onChange={e => updateRow(row.id, 'driverType', e.target.value)}>
                      {instanceKeys.map(k => {
                        const r = DEV_INSTANCE_OPTIONS.find(x => x.instance === k)
                        return <option key={k} value={k}>{k} | {r?.dbuPerHour} DBUs | ${r?.ratePerHour}/hr</option>
                      })}
                    </select>
                  </td>
                  <td>
                    <select className="cc-select" value={row.workerType || ''} onChange={e => updateRow(row.id, 'workerType', e.target.value)}>
                      {instanceKeys.map(k => {
                        const r = DEV_INSTANCE_OPTIONS.find(x => x.instance === k)
                        return <option key={k} value={k}>{k} | {r?.dbuPerHour} DBUs | ${r?.ratePerHour}/hr</option>
                      })}
                    </select>
                  </td>
                  <td>
                    <input type="number" min="0" className="cc-input cc-input-num" value={row.nodes}
                      onChange={e => updateRow(row.id, 'nodes', parseInt(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" min="0" step="0.5" className="cc-input cc-input-num" value={row.hrPerMonth}
                      onChange={e => updateRow(row.id, 'hrPerMonth', parseFloat(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" min="0" className="cc-input cc-input-num" value={row.numMonths}
                      onChange={e => updateRow(row.id, 'numMonths', parseInt(e.target.value) || 0)} />
                  </td>
                  <td className="cc-td-calc cc-td-cost">{fmt(row.dbx)}</td>
                  <td className="cc-td-calc cc-td-cost">{fmt(row.ec2)}</td>
                  <td className="cc-td-calc cc-td-cost" style={{ color: 'var(--amber)' }}>{fmt(row.total)}</td>
                  <td>
                    <button className="cc-btn-del" onClick={() => deleteRow(row.id)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="cc-table-foot">
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>Totals:</td>
                <td className="cc-td-cost">{fmt(totalDbxCost)}</td>
                <td className="cc-td-cost">{fmt(totalEc2Cost)}</td>
                <td className="cc-td-cost" style={{ color: 'var(--amber)' }}>{fmt(totalDbxCost + totalEc2Cost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
