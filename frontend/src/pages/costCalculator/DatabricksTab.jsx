// DatabricksTab.jsx
import { useState, useMemo } from 'react'
import { TIERS, TIER_COMPUTE_TYPES, INSTANCE_OPTIONS_BY_COMPUTE_TYPE } from './costCalculatorData'
import { calculateDatabricksCostForTier } from './calculations'

const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtN = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DatabricksTab({ dbxJobs, setDbxJobs, enableStage, setEnableStage }) {
  const [expandedTiers, setExpandedTiers] = useState({ Stage: true, 'L0 / Raw': true, 'L1 / Curated': true, 'L2 / Data Product': true })

  const activeTiers = enableStage ? TIERS : TIERS.filter(t => t !== 'Stage')

  // Grand totals
  const grandTotals = useMemo(() => {
    let totalDbx = 0, totalEc2 = 0, totalJobs = 0
    for (const tier of activeTiers) {
      const jobs = dbxJobs[tier] || []
      const { totalDbxCost, totalEc2Cost } = calculateDatabricksCostForTier(jobs)
      totalDbx += totalDbxCost
      totalEc2 += totalEc2Cost
      totalJobs += jobs.length
    }
    return { totalDbx, totalEc2, totalJobs }
  }, [dbxJobs, activeTiers])

  function updateJob(tier, jobId, field, value) {
    setDbxJobs(prev => ({
      ...prev,
      [tier]: prev[tier].map(j => j.id === jobId ? { ...j, [field]: value } : j)
    }))
  }

  function addJob(tier) {
    const types = TIER_COMPUTE_TYPES[tier] || []
    const ct = types[0]
    const opts = INSTANCE_OPTIONS_BY_COMPUTE_TYPE[ct] || []
    const newJob = {
      id: `${tier}_job_${Date.now()}`,
      jobName: `${tier.replace('/', ' ')} Job ${(dbxJobs[tier] || []).length + 1}`,
      runtimeHrs: 0, runsPerMonth: 0, computeType: ct,
      instance: opts[0]?.instance || null, nodes: 1,
    }
    setDbxJobs(prev => ({ ...prev, [tier]: [...(prev[tier] || []), newJob] }))
  }

  function deleteJob(tier, jobId) {
    setDbxJobs(prev => ({ ...prev, [tier]: prev[tier].filter(j => j.id !== jobId) }))
  }

  function toggleTier(tier) {
    setExpandedTiers(prev => ({ ...prev, [tier]: !prev[tier] }))
  }

  return (
    <div>
      <div className="cc-tab-header">
        <h2 className="cc-tab-title">⚡ Databricks &amp; Compute Costs</h2>
        <p className="cc-tab-desc">Configure jobs across different tiers. Specify runtime, compute type, instance and nodes to estimate DBX &amp; EC2 costs.</p>
      </div>

      {/* Summary KPI Row */}
      <div className="cc-kpi-row">
        <div className="cc-kpi-card" style={{ '--kpi-accent': 'var(--cyan)' }}>
          <div className="cc-kpi-label">Total Jobs</div>
          <div className="cc-kpi-value">{grandTotals.totalJobs}</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#b388ff' }}>
          <div className="cc-kpi-label">Total DBX Cost</div>
          <div className="cc-kpi-value">{fmt(grandTotals.totalDbx)}</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#00ff88' }}>
          <div className="cc-kpi-label">EC2 Costs</div>
          <div className="cc-kpi-value">{fmt(grandTotals.totalEc2)}</div>
        </div>
        <div className="cc-kpi-card" style={{ '--kpi-accent': '#ffaa00' }}>
          <div className="cc-kpi-label">Monthly Total</div>
          <div className="cc-kpi-value">{fmt(grandTotals.totalDbx + grandTotals.totalEc2)}</div>
        </div>
      </div>

      {/* Enable Stage Toggle */}
      <label className="cc-toggle-row">
        <div className={`cc-toggle ${enableStage ? 'on' : ''}`} onClick={() => setEnableStage(v => !v)}>
          <div className="cc-toggle-thumb" />
        </div>
        <span className="cc-toggle-label">Enable Stage Tier</span>
      </label>

      {/* Tier Sections */}
      {activeTiers.map(tier => {
        const jobs = dbxJobs[tier] || []
        const { enriched, totalDbxCost, totalEc2Cost } = calculateDatabricksCostForTier(jobs)
        const computeTypes = TIER_COMPUTE_TYPES[tier] || []
        const isExpanded = expandedTiers[tier] !== false

        return (
          <div key={tier} className="cc-section-card">
            <div className="cc-section-header" onClick={() => toggleTier(tier)}>
              <div className="cc-section-header-left">
                <span className="cc-tier-badge">{tier}</span>
                <span className="cc-section-meta">
                  {jobs.length} job{jobs.length !== 1 ? 's' : ''} · DBX: {fmt(totalDbxCost)} · EC2: {fmt(totalEc2Cost)}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="cc-btn-sm cc-btn-add" onClick={e => { e.stopPropagation(); addJob(tier) }}>＋ Add Job</button>
                <span className="cc-chevron">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {isExpanded && (
              <div className="cc-section-body">
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Job Name</th>
                        <th>Runtime (hrs)</th>
                        <th>Runs/Month</th>
                        <th>Compute Type</th>
                        <th>Instance Type</th>
                        <th>Worker Nodes</th>
                        <th>DBU</th>
                        <th>DBX ($)</th>
                        <th>EC2 ($)</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {enriched.map((job, idx) => {
                        const instanceOpts = INSTANCE_OPTIONS_BY_COMPUTE_TYPE[job.computeType] || []
                        return (
                          <tr key={job.id}>
                            <td className="cc-td-num">{idx + 1}</td>
                            <td>
                              <input
                                className="cc-input"
                                value={job.jobName}
                                onChange={e => updateJob(tier, job.id, 'jobName', e.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                type="number" min="0" step="0.5" className="cc-input cc-input-num"
                                value={job.runtimeHrs}
                                onChange={e => updateJob(tier, job.id, 'runtimeHrs', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td>
                              <input
                                type="number" min="0" className="cc-input cc-input-num"
                                value={job.runsPerMonth}
                                onChange={e => updateJob(tier, job.id, 'runsPerMonth', parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td>
                              <select
                                className="cc-select"
                                value={job.computeType}
                                onChange={e => {
                                  const ct = e.target.value
                                  const first = (INSTANCE_OPTIONS_BY_COMPUTE_TYPE[ct] || [])[0]?.instance || null
                                  updateJob(tier, job.id, 'computeType', ct)
                                  updateJob(tier, job.id, 'instance', first)
                                }}
                              >
                                {computeTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                              </select>
                            </td>
                            <td>
                              <select
                                className="cc-select"
                                value={job.instance || ''}
                                onChange={e => updateJob(tier, job.id, 'instance', e.target.value)}
                              >
                                {instanceOpts.map(opt => (
                                  <option key={opt.instance} value={opt.instance}>
                                    {opt.instance} | {opt.vCPU} CPUs | {opt.memoryGB}GB
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number" min="1" className="cc-input cc-input-num"
                                value={job.nodes}
                                onChange={e => updateJob(tier, job.id, 'nodes', parseInt(e.target.value) || 1)}
                              />
                            </td>
                            <td className="cc-td-calc">{fmtN(job.dbu)}</td>
                            <td className="cc-td-calc cc-td-cost">{fmt(job.dbx)}</td>
                            <td className="cc-td-calc cc-td-cost">{fmt(job.ec2)}</td>
                            <td>
                              <button className="cc-btn-del" onClick={() => deleteJob(tier, job.id)} title="Delete job">🗑</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="cc-table-foot">
                        <td colSpan={8} style={{ textAlign: 'right', fontWeight: 600 }}>Tier Total:</td>
                        <td className="cc-td-cost">{fmt(totalDbxCost)}</td>
                        <td className="cc-td-cost">{fmt(totalEc2Cost)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Configuration Guide */}
      <details className="cc-guide">
        <summary className="cc-guide-summary">ℹ️ Configuration Guide</summary>
        <div className="cc-guide-body">
          <div className="cc-guide-grid">
            <div>
              <strong>Photon Engine</strong>
              <p>Adds ~20% to DBU cost but provides significant performance improvements for analytical workloads.</p>
            </div>
            <div>
              <strong>DBU Rates (Auto-calculated)</strong>
              <p>DLT Advanced Compute ~$0.15/DBU · Jobs Compute ~$0.30/DBU (before Photon premium).</p>
            </div>
            <div>
              <strong>Spot Instances</strong>
              <p>Provides ~70% cost savings on EC2 compute but instances may be interrupted.</p>
            </div>
            <div>
              <strong>Instance Families</strong>
              <p>Choose based on workload: General Purpose (m5), Compute Optimized (c5), Memory Optimized (r5/r5d).</p>
            </div>
          </div>
        </div>
      </details>
    </div>
  )
}
