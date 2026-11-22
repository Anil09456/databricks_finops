import { useState, useEffect } from 'react'
import Sidebar from './components/layout/Sidebar'
import TopBar from './components/layout/TopBar'
import Home from './pages/Home'
import CommandCentre from './pages/CommandCentre'
import CostLookup from './pages/CostLookup'
import RunIntelligence from './pages/RunIntelligence'
import CostCalculator from './pages/CostCalculator'
import { cache } from './api/index'
import { apiFetch } from './api/client'
import { CheckCircle2, Library, PiggyBank, X } from 'lucide-react'
import SvgIcon from './components/layout/SvgIcon'

export default function App() {
  const [activePage, setActivePage] = useState(() => localStorage.getItem('finops_active_page') || 'home')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() => localStorage.getItem('finops_last_refresh') || '')
  const [toastMessage, setToastMessage] = useState('')
  const [notebookUrl, setNotebookUrl] = useState(() => window.__NOTEBOOK_URL__ || '#')
  const [notebookName, setNotebookName] = useState(() => window.__NOTEBOOK_NAME__ || 'Companion Notebook')
  const [notebookBtnLabel, setNotebookBtnLabel] = useState(() => window.__NOTEBOOK_BTN_LABEL__ || 'Open Notebook')
  const [theme, setTheme] = useState(() => localStorage.getItem('finops_theme') || 'dark')
  const [toastTimeoutId, setToastTimeoutId] = useState(null)

  useEffect(() => {
    apiFetch('/settings')
      .then(data => {
        if (data.notebook_url) {
          setNotebookUrl(data.notebook_url)
          window.__NOTEBOOK_URL__ = data.notebook_url
        }
        if (data.notebook_name) {
          setNotebookName(data.notebook_name)
          window.__NOTEBOOK_NAME__ = data.notebook_name
        }
        if (data.notebook_btn_label) {
          setNotebookBtnLabel(data.notebook_btn_label)
          window.__NOTEBOOK_BTN_LABEL__ = data.notebook_btn_label
        }
        if (!localStorage.getItem('finops_theme') && data.default_theme) {
          setTheme(data.default_theme)
        }
      })
      .catch(err => console.error('Error fetching settings:', err))
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('finops_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    const savedMsg = sessionStorage.getItem('finops_toast_message')
    if (savedMsg) {
      setToastMessage(savedMsg)
      sessionStorage.removeItem('finops_toast_message')
      const timer = setTimeout(() => setToastMessage(''), 4000)
      setToastTimeoutId(timer)
      return () => clearTimeout(timer)
    }
  }, [])

  const triggerToast = (msg) => {
    if (toastTimeoutId) clearTimeout(toastTimeoutId)
    setToastMessage(msg)
    const timer = setTimeout(() => setToastMessage(''), 4000)
    setToastTimeoutId(timer)
  }

  const handleNavigate = (pageId) => {
    setActivePage(pageId)
    localStorage.setItem('finops_active_page', pageId)
  }

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await cache.refresh()
      const now = new Date().toLocaleString()
      setLastRefresh(now)
      localStorage.setItem('finops_last_refresh', now)
      sessionStorage.setItem('finops_toast_message', 'Dashboards are refreshed!')
      window.location.reload()
    } catch (err) {
      console.error(err)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        onRefreshAll={handleRefreshAll}
        isRefreshing={isRefreshing}
        lastRefresh={lastRefresh}
        notebookUrl={notebookUrl}
        notebookName={notebookName}
      />
      <div className="main-area">
        <TopBar
          activePage={activePage}
          theme={theme}
          onToggleTheme={toggleTheme}
          notebookUrl={notebookUrl}
          notebookBtnLabel={notebookBtnLabel}
        />
        <main className="page-content">
          {activePage === 'home' && <Home onNavigate={handleNavigate} onShowToast={triggerToast} />}
          {activePage === 'command-centre' && <CommandCentre onShowToast={triggerToast} />}
          {activePage === 'cost-lookup' && <CostLookup />}
          {activePage === 'run-intelligence' && <RunIntelligence />}
          {activePage === 'cost-calculator'  && <CostCalculator />}
          {activePage === 'module_library' && (
            <div className="dashboard-panel" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <SvgIcon icon={Library} size={36} color="var(--cyan)" strokeWidth={1.5} />
              </div>
              <h2 style={{ marginBottom: 8 }}>Module Library</h2>
              <p style={{ color: '#8892a4', marginTop: 12 }}>This page acts as a catalog placeholder for future optimization modules.</p>
            </div>
          )}
          {activePage === 'savings_tracker' && (
            <div className="dashboard-panel" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <SvgIcon icon={PiggyBank} size={36} color="var(--green)" strokeWidth={1.5} />
              </div>
              <h2 style={{ marginBottom: 8 }}>Savings Tracker</h2>
              <p style={{ color: '#8892a4', marginTop: 12 }}>This page acts as a placeholder for simulating and tracking savings wins.</p>
            </div>
          )}
        </main>
      </div>

      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--surface2)',
          color: 'var(--green)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 20px var(--shadow)',
          padding: '12px 20px',
          borderRadius: 6,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 13,
          fontWeight: 'bold',
          transition: 'all 0.3s'
        }}>
          <SvgIcon icon={CheckCircle2} size={16} color="var(--green)" />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8892a4',
              cursor: 'pointer',
              marginLeft: 8,
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1
            }}
          >
            <SvgIcon icon={X} size={14} color="#8892a4" />
          </button>
        </div>
      )}
    </div>
  )
}
