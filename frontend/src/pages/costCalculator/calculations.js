// calculations.js — Pure JS mirrors of Python calculations.py
import { S3_PRICING, SQL_RATES_BY_TYPE, FLAT_RATE_CARD } from './costCalculatorData'

// ── Databricks & Compute ───────────────────────────────────────────────────────
/**
 * Calculate costs for all jobs in one tier.
 * Formula:
 *   DBX = ratePerHour × (nodes+1) × runtimeHrs × runsPerMonth
 *   EC2 = onDemandLinuxHr × (nodes+1) × runtimeHrs × runsPerMonth
 *   DBU = dbuPerHour × (nodes+1) × runtimeHrs × runsPerMonth
 */
export function calculateDatabricksCostForTier(jobs) {
  let totalDbxCost = 0, totalEc2Cost = 0, totalDbu = 0
  const enriched = jobs.map(job => {
    const row = FLAT_RATE_CARD[job.instance] || {}
    const dbuRate  = row.dbuPerHour      || 0
    const dbxRate  = row.ratePerHour     || 0
    const ec2Rate  = row.onDemandLinuxHr || 0
    const factor   = (Number(job.nodes) + 1) * Number(job.runtimeHrs) * Number(job.runsPerMonth)
    const dbu  = dbuRate * factor
    const dbx  = dbxRate * factor
    const ec2  = ec2Rate * factor
    totalDbxCost += dbx
    totalEc2Cost += ec2
    totalDbu     += dbu
    return { ...job, dbu, dbx, ec2 }
  })
  return { enriched, totalDbxCost, totalEc2Cost, totalDbu }
}

// ── S3 Storage ────────────────────────────────────────────────────────────────
/**
 * Calculate S3 cost for a single zone (Direct Storage mode).
 * Tiered: ≤50TB / ≤500TB / >500TB
 */
function getS3Rate(storageClass, storageGB) {
  const pricing = S3_PRICING[storageClass] || S3_PRICING['Standard']
  const LIMIT_50TB  = 50  * 1024
  const LIMIT_500TB = 500 * 1024
  if (storageGB <= LIMIT_50TB)  return pricing.rate50TB
  if (storageGB <= LIMIT_500TB) return pricing.rate500TB
  return pricing.rateOver500TB
}

function geometricProjection(monthlyCost, growthPct, months) {
  if (growthPct <= 0) return monthlyCost * months
  const g = 1 + growthPct / 100
  return monthlyCost * (Math.pow(g, months) - 1) / (g - 1)
}

export function calculateS3DirectCosts(s3Direct, enableS3Stage) {
  const zones = enableS3Stage
    ? ['Landing Zone', 'Stage', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']
    : ['Landing Zone', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']

  let totalMonthly = 0, totalQuarterly = 0, totalHalfYearly = 0, totalYearly = 0
  const perZone = {}

  for (const zone of zones) {
    const cfg = s3Direct[zone] || { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 }
    const storageGB = cfg.unit === 'TB' ? Number(cfg.amount) * 1024 : Number(cfg.amount)
    const rate = getS3Rate(cfg.storageClass, storageGB)
    const monthlyCost = storageGB * rate
    const g = Number(cfg.growthPercent) || 0
    const quarterly   = geometricProjection(monthlyCost, g, 3)
    const halfYearly  = geometricProjection(monthlyCost, g, 6)
    const yearly      = geometricProjection(monthlyCost, g, 12)

    perZone[zone] = { monthlyCost, quarterly, halfYearly, yearly }
    totalMonthly   += monthlyCost
    totalQuarterly += quarterly
    totalHalfYearly+= halfYearly
    totalYearly    += yearly
  }

  return { perZone, totalMonthly, totalQuarterly, totalHalfYearly, totalYearly }
}

/**
 * Table-Based S3 cost estimation.
 * Size_bytes = Records × Columns × Avg_Column_length × bpc × cr
 * bpc=1, cr=0.5, standard rate=$0.023/GB
 */
export function calculateS3TableCosts(s3TableBased) {
  const BPC = 1, CR = 0.5, STANDARD_RATE = 0.023
  let totalCost = 0
  const perZone = {}

  for (const [zone, tables] of Object.entries(s3TableBased)) {
    let zoneCost = 0
    for (const tbl of tables) {
      const records    = Number(tbl.records)          || 0
      const columns    = Number(tbl.columns)          || 0
      const numTables  = Number(tbl.numTables)        || 0
      const avgLen     = Number(tbl.avgColumnLength)  || 0
      const sizeBytes  = records * columns * avgLen * BPC * CR
      const estimatedGB = (sizeBytes / Math.pow(1024, 3)) * numTables
      zoneCost += estimatedGB * STANDARD_RATE
    }
    perZone[zone] = zoneCost
    totalCost += zoneCost
  }

  return { perZone, totalCost }
}

// ── SQL Warehouse ─────────────────────────────────────────────────────────────
/**
 * SQL DBU Cost = ratePerHour × hours × nodes
 * SQL EC2 Cost = driverRate + (onDemandRate × nodes)
 */
export function calculateSQLWarehouseCosts(sqlWarehouses) {
  let totalDbuCost = 0, totalEc2Cost = 0, totalDbus = 0

  const enriched = sqlWarehouses.map(wh => {
    const nodes = Number(wh.nodes) || 1
    const hpd   = Number(wh.hoursPerDay)   || 0
    const dpm   = Number(wh.daysPerMonth)  || 0
    if (hpd <= 0 || dpm <= 0 || nodes <= 0) {
      return { ...wh, dbuCost: 0, ec2Cost: 0, dbus: 0 }
    }
    const rates = (SQL_RATES_BY_TYPE[wh.computeType] || {})[wh.size] || {}
    const dbuRate  = rates.ratePerHour     || 0
    const dbtPerHr = rates.dbuPerHour      || 0
    const ec2Rate  = rates.onDemandLinuxHr || 0
    const hoursPerMonth = hpd * dpm
    const dbuCost = dbuRate * hoursPerMonth * nodes
    const ec2Cost = dbuRate + (ec2Rate * nodes)        // matches Python exactly
    const dbus    = dbtPerHr * hoursPerMonth * nodes
    totalDbuCost += dbuCost
    totalEc2Cost += ec2Cost
    totalDbus    += dbus
    return { ...wh, dbuCost, ec2Cost, dbus }
  })

  return { enriched, totalDbuCost, totalEc2Cost, totalDbus }
}

// ── Development Cost ──────────────────────────────────────────────────────────
/**
 * DBX = (driverRate + workerRate × nodes) × hrPerMonth × numMonths
 * EC2 = (driverEc2Rate + workerEc2Rate × nodes) × hrPerMonth × numMonths
 */
export function calculateDevCosts(devCosts) {
  let totalDbxCost = 0, totalEc2Cost = 0

  const enriched = devCosts.map(row => {
    const driverRow = FLAT_RATE_CARD[row.driverType] || {}
    const workerRow = FLAT_RATE_CARD[row.workerType] || {}
    const nodes = Number(row.nodes) || 1
    const hrs   = Number(row.hrPerMonth)  || 0
    const months= Number(row.numMonths)   || 0
    const driverDbx = driverRow.ratePerHour     || 0
    const workerDbx = workerRow.ratePerHour     || 0
    const driverEc2 = driverRow.onDemandLinuxHr || 0
    const workerEc2 = workerRow.onDemandLinuxHr || 0
    const dbx = (driverDbx + workerDbx * nodes) * hrs * months
    const ec2 = (driverEc2 + workerEc2 * nodes) * hrs * months
    const total = dbx + ec2
    totalDbxCost += dbx
    totalEc2Cost += ec2
    return { ...row, dbx, ec2, total }
  })

  return { enriched, totalDbxCost, totalEc2Cost }
}

// ── Grand Total ───────────────────────────────────────────────────────────────
export function computeGrandTotals({ dbxData, s3Cost, sqlDbuCost, sqlEc2Cost, devDbxCost, devEc2Cost, tableCost }) {
  const monthly = Object.values(dbxData).reduce((s, d) => s + d.totalDbxCost + d.totalEc2Cost, 0)
    + s3Cost + sqlDbuCost + sqlEc2Cost + devDbxCost + devEc2Cost + tableCost
  return {
    monthly,
    quarterly:  monthly * 3,
    halfYearly: monthly * 6,
    yearly:     monthly * 12,
  }
}
