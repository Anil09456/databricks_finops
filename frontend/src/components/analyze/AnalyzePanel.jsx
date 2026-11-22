const SEV_COLORS = {
  critical: { bg: 'rgba(255,51,102,0.08)',  color: '#ff3366' },
  high:     { bg: 'rgba(255,170,0,0.08)',   color: '#ffaa00' },
  medium:   { bg: 'rgba(0,212,255,0.06)',   color: '#00d4ff' },
  low:      { bg: 'rgba(0,255,136,0.06)',   color: '#00ff88' },
}

export default function AnalyzePanel({ result, onClose }) {
  if (!result) return null
  const { issues, explore_modules } = result

  return (
    <div className="analyze-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="analyze-header">🔍 Issue Analysis</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {issues.length === 0 ? (
        <div className="no-data">✅ No issues detected — metrics within healthy thresholds</div>
      ) : (
        issues.map((issue, i) => {
          const sev = SEV_COLORS[issue.severity] || SEV_COLORS.medium
          return (
            <div key={i} className="issue-row"
              style={{ '--sev-bg': sev.bg, '--sev-color': sev.color }}>
              <div style={{ flex: 1 }}>
                <div>
                  <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
                  <span className="issue-desc">{issue.label}</span>
                </div>
                {issue.tip && <div className="issue-tip">💡 {issue.tip}</div>}
                {issue.modules?.length > 0 && (
                  <div className="module-chips">
                    {issue.modules.map(m => (
                      <a key={m.number} href={m.url} target="_blank" rel="noreferrer"
                        className="module-chip">
                        MOD-{m.number} · {m.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}

      {explore_modules?.length > 0 && (
        <>
          <div style={{ marginTop: 16, marginBottom: 8, fontSize: 9, color: 'var(--text-lo)', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            📡 Explore in Notebook
          </div>
          <div className="module-chips">
            {explore_modules.map(m => (
              <a key={m.number} href={m.url} target="_blank" rel="noreferrer"
                className="module-chip">
                MOD-{m.number} · {m.name}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
