import { useState, useEffect } from 'react'
import { overall as api } from '../api/index'
import OverallTab from './tabs/OverallTab'
import InteractiveTab from './tabs/InteractiveTab'
import JobsTab from './tabs/JobsTab'
import SqlWarehouseTab from './tabs/SqlWarehouseTab'
import QueryIntelligenceTab from './tabs/QueryIntelligenceTab'
import DltTab from './tabs/DltTab'
import MergeClusteringTab from './tabs/MergeClusteringTab'
import StorageTab from './tabs/StorageTab'
import TaggingChargebackTab from './tabs/TaggingChargebackTab'
import RightPanel from '../components/layout/RightPanel'
import {
  BarChart3, Monitor, Wrench, Warehouse, SearchCode,
  GitMerge, RefreshCcw, HardDrive, Tag
} from 'lucide-react'
import SvgIcon from '../components/layout/SvgIcon'

const TABS = [
  { id: 'overall',       icon: BarChart3,    label: 'Overall' },
  { id: 'interactive',   icon: Monitor,      label: 'Interactive' },
  { id: 'jobs',          icon: Wrench,       label: 'Jobs' },
  { id: 'sql_warehouse', icon: Warehouse,    label: 'SQL Warehouses' },
  { id: 'qi',            icon: SearchCode,   label: 'Query Intelligence' },
  { id: 'dlt',           icon: GitMerge,     label: 'DLT' },
  { id: 'merge',         icon: RefreshCcw,   label: 'MERGE & Clustering' },
  { id: 'storage',       icon: HardDrive,    label: 'Storage' },
  { id: 'chargeback',    icon: Tag,          label: 'Tagging & Chargeback' },
]

export default function CommandCentre({ onShowToast }) {
  const [activeTab, setActiveTab] = useState('overall')
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [activeChartId, setActiveChartId] = useState(null)
  const [activeMetrics, setActiveMetrics] = useState(null)
  const [workspaces, setWorkspaces] = useState([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)

  const reloadWorkspaces = async () => {
    setLoadingWorkspaces(true)
    try {
      const res = await api.workspaces()
      if (Array.isArray(res)) {
        setWorkspaces(res)
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err)
    } finally {
      setLoadingWorkspaces(false)
    }
  }

  useEffect(() => {
    let active = true
    setLoadingWorkspaces(true)
    api.workspaces().then(res => {
      if (active && Array.isArray(res)) {
        setWorkspaces(res)
      }
    }).catch(err => {
      console.error("Failed to load workspaces:", err)
    }).finally(() => {
      if (active) setLoadingWorkspaces(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    // Trigger window resize event after state transitions to allow Plotly charts to recalculate layout widths
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 150)
    return () => clearTimeout(timer)
  }, [activeTab, rightPanelOpen])

  const handleRadarClick = (chartId, metrics) => {
    if (rightPanelOpen && activeChartId === chartId) {
      setRightPanelOpen(false)
      setActiveChartId(null)
      setActiveMetrics(null)
    } else {
      setRightPanelOpen(true)
      setActiveChartId(chartId)
      setActiveMetrics(metrics)
    }
  }

  const closeRightPanel = () => {
    setRightPanelOpen(false)
    setActiveChartId(null)
    setActiveMetrics(null)
  }

  return (
    <div className="command-centre-outer">
      {/* Tab Navigation row — full width */}
      <div className="command-tabs-row">
        {TABS.map(tab => {
          const isSelected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`tab-nav-btn ${isSelected ? 'active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <SvgIcon
                icon={tab.icon}
                size={14}
                color={isSelected ? 'var(--cyan)' : 'var(--text-mid)'}
              />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Main content area + optional right panel */}
      <div className="command-centre-body">
        <div className="command-centre-main">
          {/* All tabs mounted, hidden via CSS — preserves loaded data */}
          <div style={{ display: activeTab === 'overall'      ? 'block' : 'none' }}>
            <OverallTab          workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'interactive'  ? 'block' : 'none' }}>
            <InteractiveTab      workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'jobs'         ? 'block' : 'none' }}>
            <JobsTab             workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'sql_warehouse'? 'block' : 'none' }}>
            <SqlWarehouseTab     workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'qi'           ? 'block' : 'none' }}>
            <QueryIntelligenceTab workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'dlt'          ? 'block' : 'none' }}>
            <DltTab              workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'merge'        ? 'block' : 'none' }}>
            <MergeClusteringTab  workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'storage'      ? 'block' : 'none' }}>
            <StorageTab          workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
          <div style={{ display: activeTab === 'chargeback'   ? 'block' : 'none' }}>
            <TaggingChargebackTab workspaces={workspaces} onReloadWorkspaces={reloadWorkspaces} loadingWorkspaces={loadingWorkspaces} onRadarClick={handleRadarClick} activeChartId={activeChartId} rightPanelOpen={rightPanelOpen} onShowToast={onShowToast} />
          </div>
        </div>

        {/* Right panel: fixed to right edge of the body */}
        {rightPanelOpen && (
          <RightPanel
            chartId={activeChartId}
            metrics={activeMetrics}
            onClose={closeRightPanel}
          />
        )}
      </div>
    </div>
  )
}
