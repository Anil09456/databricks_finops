// CostCalculator.jsx — Main Cost Calculator Page
import { useState, useMemo } from 'react'
import { buildDefaultState } from './costCalculator/costCalculatorData'
import {
  calculateDatabricksCostForTier,
  calculateS3DirectCosts,
  calculateS3TableCosts,
  calculateSQLWarehouseCosts,
  calculateDevCosts,
  computeGrandTotals,
} from './costCalculator/calculations'
import { exportCostReport } from './costCalculator/exportToExcel'
import DatabricksTab            from './costCalculator/DatabricksTab'
import S3Tab                    from './costCalculator/S3Tab'
import SQLWarehouseTab          from './costCalculator/SQLWarehouseTab'
import DevelopmentTab           from './costCalculator/DevelopmentTab'
import CalculationExplanationTab from './costCalculator/CalculationExplanationTab'
import CostSummaryPanel         from './costCalculator/CostSummaryPanel'

const TABS = [
  { id: 'databricks', icon: '⚡', label: 'Databricks & Compute' },
  { id: 's3',         icon: '🗄️', label: 'S3 Storage' },
  { id: 'sql',        icon: '🏭', label: 'SQL Warehouse' },
  { id: 'dev',        icon: '🛠️', label: 'Development Cost' },
  { id: 'explain',    icon: '📖', label: 'Calculation Explanation' },
]

export default function CostCalculator() {
  const [activeTab,    setActiveTab]    = useState('databricks')
  const [state,        setState]        = useState(() => buildDefaultState())
  const [resetConfirm, setResetConfirm] = useState(false)

  // Destructure state
  const { enableStage, enableS3Stage, s3CalcMethod, dbxJobs, s3Direct, s3TableBased, sqlWarehouses, devCosts } = state

  // Setters that update the merged state object
  const set = (key) => (updater) =>
    setState(prev => ({
      ...prev,
      [key]: typeof updater === 'function' ? updater(prev[key]) : updater
    }))

  // ── Calculations (run reactively) ───────────────────────────────────────────
  const activeTiers = enableStage
    ? ['Stage', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']
    : ['L0 / Raw', 'L1 / Curated', 'L2 / Data Product']

  const dbxData = useMemo(() => {
    const result = {}
    for (const tier of activeTiers) {
      result[tier] = calculateDatabricksCostForTier(dbxJobs[tier] || [])
    }
    return result
  }, [dbxJobs, activeTiers])

  const s3Results      = useMemo(() => calculateS3DirectCosts(s3Direct, enableS3Stage), [s3Direct, enableS3Stage])
  const s3TableResults = useMemo(() => calculateS3TableCosts(s3TableBased), [s3TableBased])
  const sqlData        = useMemo(() => calculateSQLWarehouseCosts(sqlWarehouses), [sqlWarehouses])
  const devData        = useMemo(() => calculateDevCosts(devCosts), [devCosts])

  const s3Cost      = s3CalcMethod === 'Direct Storage' ? s3Results.totalMonthly : s3TableResults.totalCost
  const tableCost   = s3CalcMethod === 'Direct Storage' ? 0 : 0 // only one mode active at a time
  const dbxTotal    = Object.values(dbxData).reduce((s, d) => s + d.totalDbxCost + d.totalEc2Cost, 0)
  const sqlTotal    = sqlData.totalDbuCost + sqlData.totalEc2Cost
  const devTotal    = devData.totalDbxCost + devData.totalEc2Cost

  const totals = useMemo(() => computeGrandTotals({
    dbxData,
    s3Cost: s3Results.totalMonthly,
    sqlDbuCost: sqlData.totalDbuCost,
    sqlEc2Cost: sqlData.totalEc2Cost,
    devDbxCost: devData.totalDbxCost,
    devEc2Cost: devData.totalEc2Cost,
    tableCost: s3TableResults.totalCost,
  }), [dbxData, s3Results, sqlData, devData, s3TableResults])

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (resetConfirm) {
      setState(buildDefaultState())
      setResetConfirm(false)
    } else {
      setResetConfirm(true)
      setTimeout(() => setResetConfirm(false), 3000)
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = () => {
    exportCostReport({
      dbxData,
      s3Results,
      s3Method: s3CalcMethod,
      s3TableResults,
      sqlData: { ...sqlData, enriched: sqlWarehouses.map(wh => ({ ...wh, ...sqlData.enriched?.find(e => e.id === wh.id) })) },
      devData: { ...devData, enriched: devCosts.map(r => ({ ...r, ...devData.enriched?.find(e => e.id === r.id) })) },
      totals,
      s3Direct,
    })
  }

  const fmt = (n) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="cc-page">
      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="cc-page-header">
        <div className="cc-page-header-left">
          <h1 className="cc-page-title">☁️ Cloud Cost Calculator</h1>
          <p className="cc-page-subtitle">Databricks &amp; AWS Cost Estimation · Enterprise Plan · us-east-1</p>
        </div>
        <div className="cc-page-header-right">
          <button
            className={`cc-btn-reset ${resetConfirm ? 'confirm' : ''}`}
            onClick={handleReset}
            title="Reset all inputs to defaults"
          >
            {resetConfirm ? '⚠️ Confirm Reset' : '↺ Reset'}
          </button>
          <button className="cc-btn-export" onClick={handleExport}>
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* ── Main Body: Tabs (3) + Summary (1) ──────────────────────────────── */}
      <div className="cc-layout">
        {/* Left: Tabbed content */}
        <div className="cc-main">
          {/* Tab bar */}
          <div className="cc-tab-bar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`cc-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                id={`cc-tab-${tab.id}`}
              >
                <span className="cc-tab-icon">{tab.icon}</span>
                <span className="cc-tab-label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="cc-tab-content">
            {activeTab === 'databricks' && (
              <DatabricksTab
                dbxJobs={dbxJobs}
                setDbxJobs={set('dbxJobs')}
                enableStage={enableStage}
                setEnableStage={set('enableStage')}
              />
            )}
            {activeTab === 's3' && (
              <S3Tab
                s3CalcMethod={s3CalcMethod}
                setS3CalcMethod={set('s3CalcMethod')}
                s3Direct={s3Direct}
                setS3Direct={set('s3Direct')}
                s3TableBased={s3TableBased}
                setS3TableBased={set('s3TableBased')}
                enableS3Stage={enableS3Stage}
                setEnableS3Stage={set('enableS3Stage')}
              />
            )}
            {activeTab === 'sql' && (
              <SQLWarehouseTab
                sqlWarehouses={sqlWarehouses}
                setSqlWarehouses={set('sqlWarehouses')}
              />
            )}
            {activeTab === 'dev' && (
              <DevelopmentTab
                devCosts={devCosts}
                setDevCosts={set('devCosts')}
              />
            )}
            {activeTab === 'explain' && <CalculationExplanationTab />}
          </div>
        </div>

        {/* Right: Summary Panel */}
        <div className="cc-sidebar">
          <CostSummaryPanel
            totals={totals}
            dbxTotal={dbxTotal}
            s3Cost={s3CalcMethod === 'Direct Storage' ? s3Results.totalMonthly : 0}
            sqlTotal={sqlTotal}
            devTotal={devTotal}
            tableBasedCost={s3CalcMethod === 'Table-Based' ? s3TableResults.totalCost : 0}
          />
        </div>
      </div>
    </div>
  )
}
