// costCalculatorData.js
// All pricing data embedded as JS constants (sourced from Streamlit CSV/Excel files)
// S3_Storage_cost.xlsx | SQL_warehouse - Sheet1.csv | final_out.csv

import RATE_CARD_RAW from './rate_card_raw.json'

// ── S3 Pricing (from S3_Storage_cost.xlsx) ────────────────────────────────────
export const S3_PRICING = {
  'Standard':                   { rate50TB: 0.023,   rate500TB: 0.022,   rateOver500TB: 0.021 },
  'Intelligent-Tiering':        { rate50TB: 0.023,   rate500TB: 0.022,   rateOver500TB: 0.021 },
  'Standard-Infrequent Access': { rate50TB: 0.0125,  rate500TB: 0.0125,  rateOver500TB: 0.0125 },
  'Express One Zone':           { rate50TB: 0.11,    rate500TB: 0.11,    rateOver500TB: 0.11 },
  'Glacier Instant Retrieval':  { rate50TB: 0.004,   rate500TB: 0.004,   rateOver500TB: 0.004 },
  'Glacier Flexible Retrieval': { rate50TB: 0.0036,  rate500TB: 0.0036,  rateOver500TB: 0.0036 },
  'Glacier Deep Archive':       { rate50TB: 0.00099, rate500TB: 0.00099, rateOver500TB: 0.00099 },
  'One Zone-Infrequent Access': { rate50TB: 0.010,   rate500TB: 0.010,   rateOver500TB: 0.010 },
}
export const S3_STORAGE_CLASSES = Object.keys(S3_PRICING)

// ── SQL Warehouse Rates (from SQL_warehouse - Sheet1.csv) ─────────────────────
export const SQL_RAW_RATES = [
  { computeType: 'SQL Pro Compute', instance: '2X-Small', workerCount: 1,   dbuPerHour: 4,   ratePerHour: 2.2,   onDemandLinuxHr: 0.624 },
  { computeType: 'SQL Pro Compute', instance: 'X-Small',  workerCount: 2,   dbuPerHour: 6,   ratePerHour: 3.3,   onDemandLinuxHr: 0.624 },
  { computeType: 'SQL Pro Compute', instance: 'Small',    workerCount: 4,   dbuPerHour: 12,  ratePerHour: 6.6,   onDemandLinuxHr: 1.248 },
  { computeType: 'SQL Pro Compute', instance: 'Medium',   workerCount: 8,   dbuPerHour: 24,  ratePerHour: 13.2,  onDemandLinuxHr: 2.496 },
  { computeType: 'SQL Pro Compute', instance: 'Large',    workerCount: 16,  dbuPerHour: 40,  ratePerHour: 22,    onDemandLinuxHr: 2.496 },
  { computeType: 'SQL Pro Compute', instance: 'X-Large',  workerCount: 32,  dbuPerHour: 80,  ratePerHour: 44,    onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Pro Compute', instance: '2X-Large', workerCount: 64,  dbuPerHour: 144, ratePerHour: 79.2,  onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Pro Compute', instance: '3X-Large', workerCount: 128, dbuPerHour: 272, ratePerHour: 149.6, onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Pro Compute', instance: '4X-Large', workerCount: 256, dbuPerHour: 528, ratePerHour: 290.4, onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Compute',     instance: '2X-Small', workerCount: 1,   dbuPerHour: 4,   ratePerHour: 0.88,  onDemandLinuxHr: 0.624 },
  { computeType: 'SQL Compute',     instance: 'X-Small',  workerCount: 2,   dbuPerHour: 6,   ratePerHour: 1.32,  onDemandLinuxHr: 0.624 },
  { computeType: 'SQL Compute',     instance: 'Small',    workerCount: 4,   dbuPerHour: 12,  ratePerHour: 2.64,  onDemandLinuxHr: 1.248 },
  { computeType: 'SQL Compute',     instance: 'Medium',   workerCount: 8,   dbuPerHour: 24,  ratePerHour: 5.28,  onDemandLinuxHr: 2.496 },
  { computeType: 'SQL Compute',     instance: 'Large',    workerCount: 16,  dbuPerHour: 40,  ratePerHour: 8.8,   onDemandLinuxHr: 2.496 },
  { computeType: 'SQL Compute',     instance: 'X-Large',  workerCount: 32,  dbuPerHour: 80,  ratePerHour: 17.6,  onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Compute',     instance: '2X-Large', workerCount: 64,  dbuPerHour: 144, ratePerHour: 31.68, onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Compute',     instance: '3X-Large', workerCount: 128, dbuPerHour: 272, ratePerHour: 59.84, onDemandLinuxHr: 4.992 },
  { computeType: 'SQL Compute',     instance: '4X-Large', workerCount: 256, dbuPerHour: 528, ratePerHour: 116.16,onDemandLinuxHr: 4.992 },
]

export const SQL_WAREHOUSE_TYPES = ['SQL Compute', 'SQL Pro Compute']

// max worker count by instance size (matches Streamlit SQL_WORKER_COUNTS_BY_DRIVER)
export const SQL_WORKER_COUNTS = {
  '2X-Small': 1, 'X-Small': 2, 'Small': 4, 'Medium': 8,
  'Large': 16, 'X-Large': 32, '2X-Large': 64, '3X-Large': 128, '4X-Large': 128
}

// Build lookup: computeType -> { instance -> row }
export const SQL_RATES_BY_TYPE = {}
for (const row of SQL_RAW_RATES) {
  if (!SQL_RATES_BY_TYPE[row.computeType]) SQL_RATES_BY_TYPE[row.computeType] = {}
  SQL_RATES_BY_TYPE[row.computeType][row.instance] = row
}

// Sizes per type (formatted strings for dropdown)
export const SQL_SIZES_BY_TYPE = {}
for (const row of SQL_RAW_RATES) {
  if (!SQL_SIZES_BY_TYPE[row.computeType]) SQL_SIZES_BY_TYPE[row.computeType] = []
  SQL_SIZES_BY_TYPE[row.computeType].push(row.instance)
}

// ── Compute Rate Card (from final_out.csv) ────────────────────────────────────
export const RATE_CARD = RATE_CARD_RAW

// Compute types for tier routing
export const TIERS = ['Stage', 'L0 / Raw', 'L1 / Curated', 'L2 / Data Product']

export const TIER_COMPUTE_TYPES = {
  'Stage':             ['DLT Advanced Compute', 'DLT Advanced Compute Photon'],
  'L0 / Raw':          ['DLT Advanced Compute', 'DLT Advanced Compute Photon'],
  'L1 / Curated':      ['Jobs Compute', 'Jobs Compute Photon'],
  'L2 / Data Product': ['Jobs Compute', 'Jobs Compute Photon'],
}

// Build instance options per compute type: "instance | vCPU CPUs | MemGB" -> instance
export const INSTANCE_OPTIONS_BY_COMPUTE_TYPE = {}
for (const row of RATE_CARD) {
  const key = row.computeType
  if (!INSTANCE_OPTIONS_BY_COMPUTE_TYPE[key]) INSTANCE_OPTIONS_BY_COMPUTE_TYPE[key] = []
  // avoid duplicates
  if (!INSTANCE_OPTIONS_BY_COMPUTE_TYPE[key].find(r => r.instance === row.instance)) {
    INSTANCE_OPTIONS_BY_COMPUTE_TYPE[key].push(row)
  }
}

// Flat lookup: instance -> row (for rate lookup by instance name)
export const FLAT_RATE_CARD = {}
for (const row of RATE_CARD) {
  FLAT_RATE_CARD[row.instance] = row
}

// Dev compute (All-Purpose Compute)
export const DEV_INSTANCE_OPTIONS = RATE_CARD.filter(r => r.computeType === 'All-Purpose Compute')

// ── Default State Factory ─────────────────────────────────────────────────────
// Returns a fresh default state exactly matching Streamlit defaults

function getFirstInstanceForTier(tier) {
  const types = TIER_COMPUTE_TYPES[tier] || []
  const ct = types[0]
  const opts = INSTANCE_OPTIONS_BY_COMPUTE_TYPE[ct] || []
  return { computeType: ct, instance: opts[0]?.instance || null }
}

function getFirstDevInstance() {
  return DEV_INSTANCE_OPTIONS[0]?.instance || null
}

export function buildDefaultState() {
  // Databricks jobs: 1 row per tier
  const dbxJobs = {}
  for (const tier of TIERS) {
    const { computeType, instance } = getFirstInstanceForTier(tier)
    dbxJobs[tier] = [{
      id: `${tier}_job_1`,
      jobName: `${tier.replace('/', ' ')} Job 1`,
      runtimeHrs: 0,
      runsPerMonth: 0,
      computeType,
      instance,
      nodes: 1,
    }]
  }

  // S3 state
  const s3Direct = {
    'Landing Zone':     { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 },
    'Stage':            { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 },
    'L0 / Raw':         { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 },
    'L1 / Curated':     { storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 },
    'L2 / Data Product':{ storageClass: 'Standard', amount: 0, unit: 'GB', growthPercent: 0 },
  }

  const s3TableBased = {
    'Source System Table': [{ tableName: 'Source_system_Table_1', records: 0, columns: 0, numTables: 0, avgColumnLength: 0 }],
    'L0 / Raw':            [{ tableName: 'Bronze_Table_1',         records: 0, columns: 0, numTables: 0, avgColumnLength: 0 }],
    'L1 / Curated':        [{ tableName: 'Silver_Table_1',         records: 0, columns: 0, numTables: 0, avgColumnLength: 0 }],
    'L2 / Data Product':   [{ tableName: 'Gold_Table_1',           records: 0, columns: 0, numTables: 0, avgColumnLength: 0 }],
  }

  // SQL warehouses
  const sqlWarehouses = [{
    id: 'warehouse_0',
    name: 'Primary BI Warehouse',
    computeType: 'SQL Compute',
    size: '2X-Small',
    nodes: 1,
    hoursPerDay: 0,
    daysPerMonth: 0,
    autoSuspend: true,
    suspendAfter: 10,
  }]

  // Dev costs
  const devInstance = getFirstDevInstance()
  const devCosts = [{
    id: 'dev_0',
    computeType: 'All-Purpose Compute',
    driverType: devInstance,
    workerType: devInstance,
    nodes: 1,
    hrPerMonth: 0,
    numMonths: 0,
  }]

  return {
    enableStage: true,
    enableS3Stage: true,
    s3CalcMethod: 'Direct Storage',
    dbxJobs,
    s3Direct,
    s3TableBased,
    sqlWarehouses,
    devCosts,
  }
}
