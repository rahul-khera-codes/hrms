/**
 * Dominican Republic payroll rules (TSS Resolución 01-2023, DGII 2026 brackets).
 * Applicable Deductions: only Regular Salary (and Commissions, Vacation if applicable) are SS Quotable.
 * Extra hours, bonuses, incentives, subsidies, profit sharing: Taxable but NOT SS Quotable.
 * Non-taxable reimbursements and Salario Navidad: neither SS nor Tax.
 */

// --- Social Security (bi-weekly) ---
const SS_BIWEEKLY = {
  MIN_QUOTABLE: 8931.9,
  SFS_EMPLOYEE_PCT: 0.0304,
  SFS_MAX_QUOTABLE: 89319.2,
  AFP_EMPLOYEE_PCT: 0.0287,
  AFP_MAX_QUOTABLE: 178638.5,
}

// --- Tax retention brackets 2026 - MONTHLY (DGII) ---
const TAX_BRACKETS_2026_MONTHLY = [
  { from: 1, to: 34685, baseAmount: 0, pct: 0, surpass: 0 },
  { from: 34685, to: 52027.42, baseAmount: 0, pct: 0.15, surpass: 34685 },
  { from: 52027.42, to: 72260.25, baseAmount: 2601.33, pct: 0.2, surpass: 52027.42 },
  { from: 72260.25, to: Infinity, baseAmount: 6648, pct: 0.25, surpass: 72260.25 },
]

/**
 * Quotable for SS = Regular Salary only (per Applicable Deductions).
 * Extra hours, bonuses, incentives are NOT quotable.
 * @param {number} regularPay - Regular pay for the period (bi-weekly)
 * @returns {number} Employee SS deduction (SFS + AFP) for bi-weekly period
 */
function computeSSEmployeeBiWeekly(regularPay) {
  const q = Number(regularPay) || 0
  if (q < SS_BIWEEKLY.MIN_QUOTABLE) return 0
  const sfsBase = Math.min(q, SS_BIWEEKLY.SFS_MAX_QUOTABLE)
  const afpBase = Math.min(q, SS_BIWEEKLY.AFP_MAX_QUOTABLE)
  const sfs = sfsBase * SS_BIWEEKLY.SFS_EMPLOYEE_PCT
  const afp = afpBase * SS_BIWEEKLY.AFP_EMPLOYEE_PCT
  return Math.round((sfs + afp) * 100) / 100
}

/**
 * Tax 2026: apply monthly brackets to monthly taxable, then scale to period.
 * For bi-weekly: taxable_monthly_equivalent = period_taxable * (26/12), then tax_period = tax_monthly * (12/26).
 * @param {number} periodTaxable - Taxable income for the period (gross + additions - deductions; excludes non-taxable)
 * @param {boolean} isBiWeekly - If true, period is 2 weeks (26 periods/year); else treat as monthly
 * @returns {number} Tax retention for the period
 */
function computeTaxForPeriod(periodTaxable, isBiWeekly = true) {
  const taxable = Number(periodTaxable) || 0
  if (taxable <= 0) return 0
  let monthlyTaxable
  if (isBiWeekly) {
    monthlyTaxable = taxable * (26 / 12)
  } else {
    monthlyTaxable = taxable
  }
  let bracket = TAX_BRACKETS_2026_MONTHLY[TAX_BRACKETS_2026_MONTHLY.length - 1]
  for (const b of TAX_BRACKETS_2026_MONTHLY) {
    if (monthlyTaxable >= b.from && monthlyTaxable <= b.to) {
      bracket = b
      break
    }
    if (monthlyTaxable < b.from) break
    bracket = b
  }
  const excess = Math.max(0, monthlyTaxable - bracket.surpass)
  const taxMonthly = bracket.baseAmount + excess * bracket.pct
  const taxPeriod = isBiWeekly ? taxMonthly * (12 / 26) : taxMonthly
  return Math.round(taxPeriod * 100) / 100
}

export { computeSSEmployeeBiWeekly, computeTaxForPeriod, SS_BIWEEKLY, TAX_BRACKETS_2026_MONTHLY }
