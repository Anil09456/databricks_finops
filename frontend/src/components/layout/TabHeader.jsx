/**
 * TabHeader — shared section-header component for all dashboard tabs.
 * Replaces the repetitive emoji-laden header pattern across all 9 tabs.
 *
 * Props:
 *   icon          — Lucide icon component
 *   iconColor     — colour for the icon (default: var(--cyan))
 *   title         — panel title string
 *   subtitle      — panel subtitle string
 *   refreshing    — boolean
 *   onRefresh     — function
 *   refreshId     — id for refresh button
 *   analyzing     — boolean
 *   onAnalyze     — function (optional — omit to hide Analyze button)
 *   analyzeActive — boolean
 *   analyzeId     — id for analyze button
 *   onInsights    — function (optional — omit to hide Insights button)
 *   insightsActive— boolean
 *   insightsId    — id for insights button
 *   workspaceId   — current workspace selection
 *   workspaces    — array of workspace objects
 *   onWorkspaceChange — function
 *   onReloadWorkspaces — function
 *   loadingWorkspaces — boolean
 */
import { RefreshCw, Loader2, ScanSearch, Radar } from 'lucide-react'
import SvgIcon from '../layout/SvgIcon'

export default function TabHeader({
  icon,
  iconColor = 'var(--cyan)',
  title,
  subtitle,
  refreshing,
  onRefresh,
  refreshId,
  analyzing,
  onAnalyze,
  analyzeActive,
  analyzeId,
  onInsights,
  insightsActive,
  insightsId,
  workspaceId,
  workspaces = [],
  onWorkspaceChange,
  onReloadWorkspaces,
  loadingWorkspaces,
}) {
  return (
    <div className="section-header-row">
      <div className="title-block">
        <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {icon && <SvgIcon icon={icon} size={16} color={iconColor} />}
          {title}
        </div>
        {subtitle && <div className="panel-subtitle">{subtitle}</div>}
      </div>

      {/* Refresh */}
      <button
        className="icon-btn refresh"
        onClick={onRefresh}
        disabled={refreshing}
        id={refreshId}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
      >
        <SvgIcon
          icon={refreshing ? Loader2 : RefreshCw}
          size={13}
          color="currentColor"
          className={refreshing ? 'lucide-spin' : ''}
        />
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      {/* Analyze (optional) */}
      {onAnalyze && (
        <button
          className={`icon-btn analyze ${analyzeActive ? 'active' : ''}`}
          onClick={onAnalyze}
          disabled={analyzing}
          id={analyzeId}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <SvgIcon
            icon={analyzing ? Loader2 : ScanSearch}
            size={13}
            color="currentColor"
            className={analyzing ? 'lucide-spin' : ''}
          />
          Analyze
        </button>
      )}

      {/* Insights (optional) */}
      {onInsights && (
        <button
          className={`icon-btn radar-section-btn ${insightsActive ? 'active' : ''}`}
          onClick={onInsights}
          title="Open AI Insights Panel"
          id={insightsId}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <SvgIcon icon={Radar} size={13} color="currentColor" />
          Insights
        </button>
      )}

      {/* Workspace selector */}
      {onWorkspaceChange && (
        <div style={{ display: 'inline-flex', alignItems: 'center', marginTop: '10px', marginLeft: '8px', flexShrink: 0, gap: 6 }}>
          <select
            className="select"
            value={workspaceId || ''}
            onChange={(e) => onWorkspaceChange(e.target.value || null)}
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
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            title="Load/Refresh Workspaces"
          >
            <SvgIcon
              icon={loadingWorkspaces ? Loader2 : RefreshCw}
              size={14}
              color="currentColor"
              className={loadingWorkspaces ? 'lucide-spin' : ''}
            />
          </button>
        </div>
      )}
    </div>
  )
}
