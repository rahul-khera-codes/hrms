/**
 * Leave pay: daily salary × payable days (admin-approved snapshot).
 * Aligns hourly/monthly interpretation with payroll getHourlyRate semantics.
 */

function hourlyRateFromEmployee(salaryType, baseSalary, workingDaysPerMonth, hoursPerDay) {
  const n = Number(baseSalary) || 0
  const wd = Number(workingDaysPerMonth) || 23.83
  const hd = Number(hoursPerDay) || 8
  if (salaryType === 'monthly') return n / wd / hd
  return n
}

/**
 * @param {object} p
 * @param {'hourly'|'monthly'} p.salaryType
 * @param {number} p.baseSalary
 * @param {number} p.workingDaysPerMonth
 * @param {number} p.hoursPerDay
 * @param {'non_payable'|'hourly_salary'|'monthly_salary'} p.calculationType
 * @param {number} p.payableDays
 */
export function computeLeavePaySnapshot(p) {
  const wd = Number(p.workingDaysPerMonth) || 23.83
  const hd = Number(p.hoursPerDay) || 8
  const base = Number(p.baseSalary) || 0
  const salaryType = p.salaryType === 'monthly' ? 'monthly' : 'hourly'

  if (p.calculationType === 'non_payable') {
    const hr = hourlyRateFromEmployee(salaryType, base, wd, hd)
    return {
      hourlyRate: Math.round(hr * 10000) / 10000,
      dailyHours: hd,
      dailySalary: 0,
      payableAmount: 0,
    }
  }

  let dailySalary = 0
  if (p.calculationType === 'hourly_salary') {
    dailySalary = hourlyRateFromEmployee(salaryType, base, wd, hd) * hd
  } else if (p.calculationType === 'monthly_salary') {
    dailySalary = salaryType === 'monthly' ? base / wd : base * hd
  }

  const pd = Math.max(0, Number(p.payableDays) || 0)
  const payableAmount = Math.round(dailySalary * pd * 100) / 100
  const hr = hourlyRateFromEmployee(salaryType, base, wd, hd)

  return {
    hourlyRate: Math.round(hr * 10000) / 10000,
    dailyHours: hd,
    dailySalary: Math.round(dailySalary * 10000) / 10000,
    payableAmount,
  }
}

export function countInclusiveCalendarDays(fromDateStr, toDateStr) {
  const cur = new Date(`${fromDateStr}T12:00:00Z`)
  const end = new Date(`${toDateStr}T12:00:00Z`)
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime()) || end < cur) return 0
  let n = 0
  const d = new Date(cur)
  while (d <= end) {
    n += 1
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}
