import { useEffect, useState } from 'react'
import { analyzeAPI } from '../../api'
import { CHART_TITLES, CHART_INTEL, MODULE_WHY, MODULE_CELLS } from './rightPanelData'

export default function RightPanel({ chartId, metrics, onClose }) {
  const [issues, setIssues] = useState([])
  const [exploreModules, setExploreModules] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!chartId) {
      setIssues([])
      setExploreModules([])
      return
    }

    const fetchAnalysis = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await analyzeAPI.detect(chartId, metrics || {})
        setIssues(res.issues || [])
        setExploreModules(res.explore_modules || [])
      } catch (err) {
        console.error('Failed to run chart analysis:', err)
        setError('Failed to load analysis')
      } finally {
        setLoading(false)
      }
    }

    fetchAnalysis()
  }, [chartId, metrics])

  const getModuleUrl = (num) => {
    const cellId = MODULE_CELLS[num]?.intro
    if (!cellId) return '#'
    const notebookUrl = window.__NOTEBOOK_URL__ || ''
    if (notebookUrl && notebookUrl !== '#') {
      if (notebookUrl.includes('#notebook/')) {
        const basePath = notebookUrl.split('/command/')[0]
        return `${basePath}/command/${cellId}`
      }
      return `${notebookUrl}#command/${cellId}`
    }
    return `https://databricks-prod-cloudfront.cloud.databricks.com/public/4027ec902e239c93eaaa8714f173bcfc/1561959874304000/notebook/0/dashboard#command/${cellId}`
  }

  const renderHeader = () => (
    <div className="right-panel-header">
      <div className="right-panel-title-text">
        {chartId ? '📡 Analysis' : '📊 Module Library'}
      </div>
      <button onClick={onClose} className="right-panel-close-btn">
        ✕
      </button>
    </div>
  )

  if (!chartId) {
    return (
      <aside className="right-panel">
        {renderHeader()}
        <div className="right-panel-desc">
          Click 📡 next to any chart to see anomaly-driven recommendations.
        </div>
        <div className="module-list">
          {Object.keys(MODULE_CELLS).sort((a, b) => Number(a) - Number(b)).map(numStr => {
            const num = Number(numStr)
            const module = MODULE_CELLS[num]
            const tags = module.tags?.join(', ') || ''
            return (
              <div key={num} className="module-item">
                <a
                  href={getModuleUrl(num)}
                  target="_blank"
                  rel="noreferrer"
                  className="module-link"
                >
                  M{num}: {module.name}
                </a>
                <div className="module-item-tags">
                  {tags}
                </div>
              </div>
            )
          })}
        </div>
      </aside>
    )
  }

  const chartTitle = CHART_TITLES[chartId] || chartId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const intel = CHART_INTEL[chartId] || {}

  const SEV_COLORS = {
    critical: { border: 'var(--red)', bg: 'rgba(255,51,102,0.08)', color: 'var(--red)' },
    high:     { border: 'var(--amber)', bg: 'rgba(255,170,0,0.08)', color: 'var(--amber)' },
    medium:   { border: 'var(--cyan)', bg: 'rgba(0,212,255,0.06)', color: 'var(--cyan)' },
    low:      { border: 'var(--green)', bg: 'rgba(0,255,136,0.06)', color: 'var(--green)' }
  }

  return (
    <aside className="right-panel">
      {renderHeader()}
      
      <div className="right-panel-chart-title">
        {chartTitle}
      </div>

      {loading ? (
        <div className="right-panel-loading">
          <div className="spinner" />
          <span>Running analysis…</span>
        </div>
      ) : error ? (
        <div className="right-panel-error">⚠️ {error}</div>
      ) : (
        <div className="right-panel-scroll-content">
          {/* Anomaly results */}
          <div className="anomaly-results">
            {issues.length === 0 ? (
              <div className="no-anomalies-found">
                ✅ No anomalies detected.
              </div>
            ) : (
              <div className="anomalies-list">
                {issues.map((issue, idx) => {
                  const sevStyle = SEV_COLORS[issue.severity] || SEV_COLORS.medium
                  return (
                    <div key={idx} className="anomaly-issue-item" style={{
                      borderLeft: `3px solid ${sevStyle.border}`,
                      background: sevStyle.bg
                    }}>
                      <div className="anomaly-sev-badge" style={{ color: sevStyle.color }}>
                        {issue.severity}
                      </div>
                      <div className="anomaly-label">
                        {issue.label}
                      </div>
                      {issue.tip && (
                        <div className="anomaly-tip">
                          💡 {issue.tip}
                        </div>
                      )}
                      {issue.modules?.length > 0 && (
                        <div className="anomaly-chips">
                          {issue.modules.map(m => (
                            <a
                              key={m.number}
                              href={getModuleUrl(m.number)}
                              target="_blank"
                              rel="noreferrer"
                              className="anomaly-chip"
                              title={m.name}
                            >
                              M{m.number}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Chart details */}
          {intel.what && (
            <div className="intel-section-group">
              <div className="intel-section">
                <div className="intel-title label-cyan">
                  📌 What This Chart Measures
                </div>
                <div className="intel-body text-hi">
                  {intel.what}
                </div>
              </div>

              {intel.signals?.length > 0 && (
                <div className="intel-section">
                  <div className="intel-title label-amber">
                    ⚡ Key Signals to Watch
                  </div>
                  <ul className="intel-list">
                    {intel.signals.map((s, idx) => <li key={idx}>{s}</li>)}
                  </ul>
                </div>
              )}

              {intel.impact && (
                <div className="intel-section">
                  <div className="intel-title label-green">
                    💰 Business Impact
                  </div>
                  <div className="intel-box border-green text-hi">
                    {intel.impact}
                  </div>
                </div>
              )}

              {intel.cadence && (
                <div className="intel-section">
                  <div className="intel-title label-cyan">
                    🗓 Recommended Review Cadence
                  </div>
                  <div className="intel-box border-cyan-dim text-lo">
                    {intel.cadence}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Module Summary */}
          {(exploreModules.length > 0 || issues.length > 0) && (
            <div className="module-summary-section">
              <div className="module-summary-title">
                📊 Dashboard & Module Summary
              </div>
              <div className="module-summary-list">
                {(exploreModules.length > 0 ? exploreModules : []).map(m => {
                  const whyList = MODULE_WHY[m.number] || []
                  return (
                    <div key={m.number} className="module-summary-item">
                      <a
                        href={getModuleUrl(m.number)}
                        target="_blank"
                        rel="noreferrer"
                        className="module-summary-link"
                      >
                        M{m.number}: {m.name}
                      </a>
                      <ul className="module-summary-why-list">
                        {whyList.map((item, idx) => (
                          <li key={idx} className="why-bullet">
                            <span className="why-bullet-dot">•</span>
                            <span dangerouslySetInnerHTML={{ __html: item }} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
