/**
 * Dominican Republic payroll rules 2026.
 * TSS: Resolución TSS No. 01-2023, No. 72-03
 * ISR: Resolución DGII No. DDG-AR1-2024-00001
 *
 * TSS quotable income: Regular Salary + VPL + Commissions only.
 * INFOTEP salary: Ordinary Salary + Commissions (no VPL).
 * ISR taxable: Gross - AFP - SFS - TSS Dep - Reimbursement.
 * Non-taxable: Reembolso No Gravable.
 */

// ─── TSS Configuration (2026 values from client's Definitions sheet) ─────────
// Monthly values. For bi-weekly payroll, divide caps by 2.
const TSS_CONFIG = {
  MIN_SALARY_MONTHLY: 23223,         // Salario Mínimo Cotizable 2026

  // AFP (Pension)
  AFP_SALARY_MULTIPLES: 20,          // Cap = 20 × min salary
  AFP_EMPLOYEE_PCT: 0.0287,          // 2.87% employee
  AFP_EMPLOYER_PCT: 0.071,           // 7.10% company

  // SFS (Health Insurance)
  SFS_SALARY_MULTIPLES: 10,          // Cap = 10 × min salary
  SFS_EMPLOYEE_PCT: 0.0304,          // 3.04% employee
  SFS_EMPLOYER_PCT: 0.0709,          // 7.09% company

  // ARL (Labor Risk) — company only, employee does NOT pay ARL
  ARL_SALARY_MULTIPLES: 4,           // Cap = 4 × min salary
  ARL_EMPLOYER_PCT: 0.011,           // 1.10% company

  // INFOTEP
  INFOTEP_EMPLOYEE_PCT: 0.005,       // 0.5% of Profit Sharing bonus (employee)
  INFOTEP_EMPLOYER_PCT: 0.01,        // 1% of INFOTEP Salary (company)
}

// Computed monthly caps
const TSS_MONTHLY_CAPS = {
  AFP: TSS_CONFIG.MIN_SALARY_MONTHLY * TSS_CONFIG.AFP_SALARY_MULTIPLES,   // 464,460
  SFS: TSS_CONFIG.MIN_SALARY_MONTHLY * TSS_CONFIG.SFS_SALARY_MULTIPLES,   // 232,230
  ARL: TSS_CONFIG.MIN_SALARY_MONTHLY * TSS_CONFIG.ARL_SALARY_MULTIPLES,   //  92,892
}

// Bi-weekly caps (monthly / 2) — client's approach for bi-weekly payroll
const TSS_BIWEEKLY_CAPS = {
  AFP: TSS_MONTHLY_CAPS.AFP / 2,   // 232,230
  SFS: TSS_MONTHLY_CAPS.SFS / 2,   // 116,115
  ARL: TSS_MONTHLY_CAPS.ARL / 2,   //  46,446
}

// Legacy compat export (used by payroll-calculator.js)
const SS_BIWEEKLY = {
  MIN_QUOTABLE: TSS_CONFIG.MIN_SALARY_MONTHLY / 2,   // bi-weekly min
  AFP_EMPLOYEE_PCT: TSS_CONFIG.AFP_EMPLOYEE_PCT,
  AFP_MAX_QUOTABLE: TSS_BIWEEKLY_CAPS.AFP,
  SFS_EMPLOYEE_PCT: TSS_CONFIG.SFS_EMPLOYEE_PCT,
  SFS_MAX_QUOTABLE: TSS_BIWEEKLY_CAPS.SFS,
}

// ─── ISR Tax Brackets 2026 — MONTHLY (DGII) ─────────────────────────────────
// Annual brackets divided by 12 to get monthly.
// From Excel Definitions sheet: TablaISRAnual / 12
const TAX_BRACKETS_2026_MONTHLY = [
  { from: 0,         to: 34685,    baseAmount: 0,       pct: 0,    surpass: 0 },
  { from: 34685,     to: 52027.42, baseAmount: 0,       pct: 0.15, surpass: 34685 },
  { from: 52027.42,  to: 72260.25, baseAmount: 2601.33, pct: 0.20, surpass: 52027.42 },
  { from: 72260.25,  to: Infinity, baseAmount: 6648,    pct: 0.25, surpass: 72260.25 },
]

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Compute AFP employee deduction for a bi-weekly period.
 * Excel formula: IF(TSS > TopeAFP/2, TopeAFP*AFPEmpleado, TSS*AFPEmpleado)
 * When bi-weekly TSS exceeds half the monthly cap, apply rate to full monthly cap.
 * Otherwise, apply rate to the actual bi-weekly TSS salary.
 * @param {number} tssSalary - TSS Salary (Ordinary + VPL + Commissions) for the bi-weekly period
 * @returns {number}
 */
function computeAFPEmployee(tssSalary) {
  const tss = Number(tssSalary) || 0
  if (tss > TSS_MONTHLY_CAPS.AFP / 2) {
    return Math.round(TSS_MONTHLY_CAPS.AFP * TSS_CONFIG.AFP_EMPLOYEE_PCT * 100) / 100
  }
  return Math.round(tss * TSS_CONFIG.AFP_EMPLOYEE_PCT * 100) / 100
}

/**
 * Compute SFS employee deduction for a bi-weekly period.
 * Excel formula: IF(TSS > TopeSFS/2, TopeSFS*SFSEmpleado, TSS*SFSEmpleado)
 * @param {number} tssSalary - TSS Salary for the bi-weekly period
 * @returns {number}
 */
function computeSFSEmployee(tssSalary) {
  const tss = Number(tssSalary) || 0
  if (tss > TSS_MONTHLY_CAPS.SFS / 2) {
    return Math.round(TSS_MONTHLY_CAPS.SFS * TSS_CONFIG.SFS_EMPLOYEE_PCT * 100) / 100
  }
  return Math.round(tss * TSS_CONFIG.SFS_EMPLOYEE_PCT * 100) / 100
}

/**
 * Compute INFOTEP employee deduction = 0.5% of Profit Sharing bonus.
 * @param {number} profitSharing - Bonificación de Ley amount for the period
 * @returns {number}
 */
function computeINFOTEPEmployee(profitSharing) {
  return Math.round((Number(profitSharing) || 0) * TSS_CONFIG.INFOTEP_EMPLOYEE_PCT * 100) / 100
}

/**
 * Compute employer TSS costs for a bi-weekly period.
 * Excel formulas:
 *   AFP_E: IF(TSS > TopeAFP, TopeAFP*AFPEmpresa, TSS*AFPEmpresa)
 *   SFS_E: IF(TSS > TopeSFS, TopeSFS*SFSEmpresa, TSS*SFSEmpresa)
 *   ARL:   IF(TSS > TopeARL/2, TopeARL*ARLEmpresa, TSS*ARLEmpresa)
 *   INFOTEP_E: 1% * INFOTEP Salary
 * Note: AFP_E and SFS_E compare to FULL monthly cap (not /2)
 * @param {number} tssSalary - TSS Salary (Ordinary + VPL + Commissions)
 * @param {number} infotepSalary - INFOTEP Salary (Ordinary + Commissions, no VPL)
 * @returns {{ afp: number, sfs: number, arl: number, infotep: number }}
 */
function computeEmployerCosts(tssSalary, infotepSalary) {
  const tss = Number(tssSalary) || 0
  const inf = Number(infotepSalary) || 0
  return {
    afp: tss > TSS_MONTHLY_CAPS.AFP
      ? Math.round(TSS_MONTHLY_CAPS.AFP * TSS_CONFIG.AFP_EMPLOYER_PCT * 100) / 100
      : Math.round(tss * TSS_CONFIG.AFP_EMPLOYER_PCT * 100) / 100,
    sfs: tss > TSS_MONTHLY_CAPS.SFS
      ? Math.round(TSS_MONTHLY_CAPS.SFS * TSS_CONFIG.SFS_EMPLOYER_PCT * 100) / 100
      : Math.round(tss * TSS_CONFIG.SFS_EMPLOYER_PCT * 100) / 100,
    arl: tss > TSS_MONTHLY_CAPS.ARL / 2
      ? Math.round(TSS_MONTHLY_CAPS.ARL * TSS_CONFIG.ARL_EMPLOYER_PCT * 100) / 100
      : Math.round(tss * TSS_CONFIG.ARL_EMPLOYER_PCT * 100) / 100,
    infotep: Math.round(inf * TSS_CONFIG.INFOTEP_EMPLOYER_PCT * 100) / 100,
  }
}

/**
 * Compute ISR (tax) for a MONTHLY taxable amount using 2026 brackets.
 * @param {number} monthlyTaxable - Monthly ISR salary
 * @returns {number} Monthly tax amount
 */
function computeISRMonthly(monthlyTaxable) {
  const taxable = Number(monthlyTaxable) || 0
  if (taxable <= 0) return 0
  let bracket = TAX_BRACKETS_2026_MONTHLY[TAX_BRACKETS_2026_MONTHLY.length - 1]
  for (const b of TAX_BRACKETS_2026_MONTHLY) {
    if (taxable <= b.to) { bracket = b; break }
  }
  const excess = Math.max(0, taxable - bracket.surpass)
  return Math.round((bracket.baseAmount + excess * bracket.pct) * 100) / 100
}

/**
 * Legacy compat: compute tax for a period (bi-weekly or monthly).
 * For bi-weekly: scales up to monthly, computes, scales back.
 * @param {number} periodTaxable - Taxable income for the period
 * @param {boolean} isBiWeekly
 * @returns {number}
 */
function computeTaxForPeriod(periodTaxable, isBiWeekly = true) {
  const taxable = Number(periodTaxable) || 0
  if (taxable <= 0) return 0
  const monthlyTaxable = isBiWeekly ? taxable * (26 / 12) : taxable
  const taxMonthly = computeISRMonthly(monthlyTaxable)
  return Math.round((isBiWeekly ? taxMonthly * (12 / 26) : taxMonthly) * 100) / 100
}

/**
 * Combined SS employee deduction (legacy compat).
 */
function computeSSEmployeeBiWeekly(regularPay) {
  const q = Number(regularPay) || 0
  if (q < SS_BIWEEKLY.MIN_QUOTABLE) return 0
  return Math.round((computeAFPEmployee(q) + computeSFSEmployee(q)) * 100) / 100
}

export {
  TSS_CONFIG,
  TSS_MONTHLY_CAPS,
  TSS_BIWEEKLY_CAPS,
  SS_BIWEEKLY,
  TAX_BRACKETS_2026_MONTHLY,
  computeAFPEmployee,
  computeSFSEmployee,
  computeINFOTEPEmployee,
  computeEmployerCosts,
  computeISRMonthly,
  computeTaxForPeriod,
  computeSSEmployeeBiWeekly,
}
