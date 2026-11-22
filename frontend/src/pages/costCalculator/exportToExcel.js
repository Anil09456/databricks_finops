// exportToExcel.js — Client-side Excel export using SheetJS (xlsx)
import * as XLSX from 'xlsx'

function fmt(n) { return typeof n === 'number' ? Number(n.toFixed(2)) : 0 }

export function exportCostReport({
  dbxData, s3Results, s3Method, s3TableResults,
  sqlData, devData, totals, s3Direct
}) {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const dbxTotal = Object.values(dbxData).reduce((s, d) => s + d.totalDbxCost + d.totalEc2Cost, 0)
  const s3Cost   = s3Method === 'Direct Storage' ? s3Results.totalMonthly : s3TableResults.totalCost
  const sqlTotal = sqlData.totalDbuCost + sqlData.totalEc2Cost
  const devTotal = devData.totalDbxCost + devData.totalEc2Cost

  const summaryRows = [
    ['Cloud Cost Calculator — Summary Report'],
    ['Generated:', new Date().toLocaleString()],
    [],
    ['Category', 'Monthly ($)', 'Quarterly ($)', 'Half-Yearly ($)', 'Yearly ($)'],
    ['Databricks & Compute', fmt(dbxTotal), fmt(dbxTotal*3), fmt(dbxTotal*6), fmt(dbxTotal*12)],
    ['S3 Storage', fmt(s3Cost),
      fmt(s3Method === 'Direct Storage' ? s3Results.totalQuarterly : s3Cost*3),
      fmt(s3Method === 'Direct Storage' ? s3Results.totalHalfYearly : s3Cost*6),
      fmt(s3Method === 'Direct Storage' ? s3Results.totalYearly : s3Cost*12)],
    ['SQL Warehouse', fmt(sqlTotal), fmt(sqlTotal*3), fmt(sqlTotal*6), fmt(sqlTotal*12)],
    ['Development Cost', fmt(devTotal), fmt(devTotal*3), fmt(devTotal*6), fmt(devTotal*12)],
    [],
    ['TOTAL', fmt(totals.monthly), fmt(totals.quarterly), fmt(totals.halfYearly), fmt(totals.yearly)],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ── Sheet 2: Databricks ───────────────────────────────────────────────────
  const dbxRows = [['Tier', 'Job Name', 'Runtime (hrs)', 'Runs/Month', 'Compute Type', 'Instance', 'Nodes', 'DBU ($)', 'DBX ($)', 'EC2 ($)']]
  for (const [tier, d] of Object.entries(dbxData)) {
    for (const job of (d.enriched || [])) {
      dbxRows.push([tier, job.jobName, job.runtimeHrs, job.runsPerMonth, job.computeType, job.instance, job.nodes, fmt(job.dbu), fmt(job.dbx), fmt(job.ec2)])
    }
    dbxRows.push(['', '', '', '', '', '', 'Tier Total', '', fmt(d.totalDbxCost), fmt(d.totalEc2Cost)])
    dbxRows.push([])
  }
  const wsDbx = XLSX.utils.aoa_to_sheet(dbxRows)
  wsDbx['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsDbx, 'Databricks & Compute')

  // ── Sheet 3: S3 Storage ───────────────────────────────────────────────────
  const s3Rows = []
  if (s3Method === 'Direct Storage') {
    s3Rows.push(['Zone', 'Storage Class', 'Amount', 'Unit', 'Monthly Growth %', 'Monthly ($)', 'Quarterly ($)', 'Half-Yearly ($)', 'Yearly ($)'])
    for (const [zone, zr] of Object.entries(s3Results.perZone || {})) {
      const cfg = s3Direct[zone] || {}
      s3Rows.push([zone, cfg.storageClass, cfg.amount, cfg.unit, cfg.growthPercent, fmt(zr.monthlyCost), fmt(zr.quarterly), fmt(zr.halfYearly), fmt(zr.yearly)])
    }
    s3Rows.push([])
    s3Rows.push(['TOTAL', '', '', '', '', fmt(s3Results.totalMonthly), fmt(s3Results.totalQuarterly), fmt(s3Results.totalHalfYearly), fmt(s3Results.totalYearly)])
  } else {
    s3Rows.push(['Zone', 'Table Name', 'Records', 'Columns', 'Num Tables', 'Avg Col Length', 'Estimated Cost ($)'])
    for (const [zone, cost] of Object.entries(s3TableResults.perZone || {})) {
      s3Rows.push([zone, '', '', '', '', '', fmt(cost)])
    }
    s3Rows.push(['TOTAL', '', '', '', '', '', fmt(s3TableResults.totalCost)])
  }
  const wsS3 = XLSX.utils.aoa_to_sheet(s3Rows)
  wsS3['!cols'] = [{ wch: 26 }, { wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsS3, 'S3 Storage')

  // ── Sheet 4: SQL Warehouse ─────────────────────────────────────────────────
  const sqlRows = [['Name', 'Compute Type', 'Size', 'Nodes', 'Hours/Day', 'Days/Month', 'DBU Cost ($)', 'EC2 Cost ($)', 'Total ($)']]
  for (const wh of (sqlData.enriched || [])) {
    sqlRows.push([wh.name, wh.computeType, wh.size, wh.nodes, wh.hoursPerDay, wh.daysPerMonth, fmt(wh.dbuCost), fmt(wh.ec2Cost), fmt((wh.dbuCost||0)+(wh.ec2Cost||0))])
  }
  sqlRows.push([])
  sqlRows.push(['TOTAL', '', '', '', '', '', fmt(sqlData.totalDbuCost), fmt(sqlData.totalEc2Cost), fmt(sqlData.totalDbuCost + sqlData.totalEc2Cost)])
  const wsSql = XLSX.utils.aoa_to_sheet(sqlRows)
  wsSql['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsSql, 'SQL Warehouse')

  // ── Sheet 5: Development Cost ──────────────────────────────────────────────
  const devRows = [['Compute Type', 'Driver Type', 'Worker Type', 'Nodes', 'Hours/Month', 'Num Months', 'DBX Cost ($)', 'EC2 Cost ($)', 'Total ($)']]
  for (const row of (devData.enriched || [])) {
    devRows.push([row.computeType, row.driverType, row.workerType, row.nodes, row.hrPerMonth, row.numMonths, fmt(row.dbx), fmt(row.ec2), fmt(row.total)])
  }
  devRows.push([])
  devRows.push(['TOTAL', '', '', '', '', '', fmt(devData.totalDbxCost), fmt(devData.totalEc2Cost), fmt(devData.totalDbxCost + devData.totalEc2Cost)])
  const wsDev = XLSX.utils.aoa_to_sheet(devRows)
  wsDev['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsDev, 'Development Cost')

  // ── Write & trigger download ───────────────────────────────────────────────
  XLSX.writeFile(wb, 'cloud_cost_report.xlsx')
}
