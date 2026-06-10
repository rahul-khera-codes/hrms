// 10JUN2026 client video Item 1 — Orlando: "Make the entire row light red,
// very light, not too noisy, for anywhere an employee shows up where their
// contract status is terminated or pre-noticed". Used by Employees, Leaves,
// Payroll Inputs, and Payroll Calculations tables. Centralizing the rule
// here so all four tables share the same color and trigger condition.

export function isInactiveContractStatus(status: string | null | undefined): boolean {
  if (!status) return false
  const s = String(status).toLowerCase()
  return s === 'terminated' || s === 'prenotice'
}

/**
 * Tailwind classes for a table row whose employee's contract status is
 * terminated or pre-noticed. Returns "" when the status is active/normal so
 * callers can concat unconditionally:
 *
 *   <tr className={`existing classes ${inactiveRowClass(r.contractStatus)}`} />
 */
export function inactiveRowClass(status: string | null | undefined): string {
  return isInactiveContractStatus(status)
    ? 'bg-red-50/60 dark:bg-red-900/15 hover:bg-red-50 dark:hover:bg-red-900/25'
    : ''
}
