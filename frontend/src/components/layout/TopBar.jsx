import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '../../api/client'
import { Settings2, Sun, Moon, ExternalLink, Wifi, WifiOff, Loader } from 'lucide-react'
import SvgIcon from './SvgIcon'

export default function TopBar({ theme, onToggleTheme, notebookUrl, notebookBtnLabel }) {
  const [connected, setConnected] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    apiFetch('/health')
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const title = 'FinOps Copilot'
  const sub = 'Databricks Cost Intelligence'

  // Connection indicator
  const connIcon = connected === null ? Loader : connected ? Wifi : WifiOff
  const connColor = connected === null ? 'var(--text-lo)' : connected ? 'var(--green)' : 'var(--red)'
  const connLabel = connected === null ? 'Connecting…' : connected ? 'Warehouse connected' : 'Disconnected'

  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        <div className="topbar-subtitle">{sub}</div>
      </div>
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        {/* Connection badge */}
        <div className="connection-badge">
          <SvgIcon
            icon={connIcon}
            size={13}
            color={connColor}
            className={connected === null ? 'lucide-spin' : ''}
          />
          <span style={{ color: connColor }}>{connLabel}</span>
        </div>

        {/* Settings Dropdown Container */}
        <div className="settings-container" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            className={`settings-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
          >
            <SvgIcon icon={Settings2} size={14} color="currentColor" />
            Settings
          </button>

          {showSettings && (
            <div className="settings-dropdown">
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-lo)', borderBottom: '1px solid var(--border)', paddingBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Quick Preferences
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-mid)' }}>Theme Mode</span>
                  <button
                    className="theme-toggle-btn"
                    onClick={() => { onToggleTheme(); setShowSettings(false) }}
                    style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <SvgIcon icon={theme === 'dark' ? Sun : Moon} size={13} color="currentColor" />
                    {theme === 'dark' ? 'Light' : 'Dark'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-mid)', marginBottom: '2px' }}>Developer Tools</span>
                  <a
                    className="notebook-link-btn"
                    href={notebookUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowSettings(false)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', boxSizing: 'border-box' }}
                  >
                    <SvgIcon icon={ExternalLink} size={13} color="currentColor" />
                    {notebookBtnLabel || 'Open Notebook'}
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
