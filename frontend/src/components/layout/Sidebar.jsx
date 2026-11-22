import {
  LayoutDashboard,
  BarChart3,
  SearchCheck,
  Cpu,
  Calculator,
  Zap,
  BookOpen,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import SvgIcon from './SvgIcon'

export default function Sidebar({ activePage, onNavigate, onRefreshAll, isRefreshing, lastRefresh, notebookUrl, notebookName }) {

  const pages = [
    { id: 'home',             icon: LayoutDashboard, label: 'Home',             sub: 'Overview' },
    { id: 'command-centre',   icon: BarChart3,        label: 'Command Centre',   sub: '9 dashboards' },
    { id: 'cost-lookup',      icon: SearchCheck,      label: 'Cost Lookup',      sub: 'Resource cost finder' },
    { id: 'run-intelligence', icon: Cpu,              label: 'Run Intelligence', sub: 'AI run analysis' },
    { id: 'cost-calculator',  icon: Calculator,       label: 'Cost Calculator',  sub: 'Cloud cost estimator' },
  ]

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <SvgIcon icon={Zap} size={18} color="var(--cyan)" strokeWidth={2.5} />
        </div>
        <div>
          <div className="logo-title">FinOps Copilot</div>
          <div className="logo-sub">DATABRICKS · v1.1</div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-section-label">Navigation</div>
      {pages.map(p => (
        <button
          key={p.id}
          className={`nav-btn ${activePage === p.id ? 'active' : ''}`}
          onClick={() => onNavigate(p.id)}
          id={`nav-${p.id}`}
        >
          <span className="nav-icon">
            <SvgIcon icon={p.icon} size={16} color={activePage === p.id ? 'var(--cyan)' : 'var(--text-mid)'} />
          </span>
          <span>
            <span className="nav-text">{p.label}</span>
            <span className="nav-sub">{p.sub}</span>
          </span>
        </button>
      ))}

      {/* Refresh */}
      <div className="sidebar-section-label" style={{ marginTop: 12 }}>Data</div>
      <button
        className="refresh-btn"
        onClick={onRefreshAll}
        disabled={isRefreshing}
        id="btn-refresh-all"
      >
        <SvgIcon
          icon={isRefreshing ? Loader2 : RefreshCw}
          size={14}
          color="currentColor"
          className={isRefreshing ? 'lucide-spin' : ''}
        />
        {isRefreshing ? 'Refreshing…' : 'Refresh All Data'}
      </button>
      {lastRefresh && (
        <div className="last-refresh">Updated {lastRefresh}</div>
      )}

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="nb-label">Linked Notebook</div>
        <a href={notebookUrl || '#'} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SvgIcon icon={BookOpen} size={13} color="var(--cyan)" />
          {notebookName || 'Companion Notebook'}
        </a>
      </div>
    </aside>
  )
}
