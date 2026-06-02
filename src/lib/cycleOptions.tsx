import type { ReactNode } from 'react'

// Minimal shape — works for both apiAdmin.PayrollPeriod and apiEmployee.PayrollPeriod
// (both have the same fields). Use a structural interface so we don't couple to either.
interface PeriodLike {
  periodFrom: string
  periodTo: string
  cycleCode: string
}

/** Return today's payroll cycle code, if any. */
export function currentCycleCode(periods: PeriodLike[]): string | null {
  const today = new Date().toISOString().slice(0, 10)
  const hit = periods.find((p) => p.periodFrom <= today && today <= p.periodTo)
  return hit ? hit.cycleCode : null
}

interface CycleOption {
  value: string
  label: ReactNode
}

/**
 * Build a list of cycle dropdown options where the current payroll cycle is
 * visually highlighted in green with a dot + "current" pill. Per 19MAY2026
 * client meeting: every cycle dropdown/filter should highlight the current
 * cycle clearly.
 *
 * @param periods   payroll periods sorted in whatever order is preferred
 * @param extra     optional extra options (typically `[{ value: '', label: 'All cycles' }]`)
 */
export function buildCycleOptions(
  periods: PeriodLike[],
  extra: CycleOption[] = [],
): CycleOption[] {
  const cur = currentCycleCode(periods)
  const main = periods.map((p) => {
    const isCurrent = cur === p.cycleCode
    return {
      value: p.cycleCode,
      label: isCurrent ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{p.cycleCode}</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            current
          </span>
        </span>
      ) : (
        <span>{p.cycleCode}</span>
      ),
    }
  })
  return [...extra, ...main]
}

/**
 * Special "RECURRENT" payroll-cycle option. Used only on the Payroll Inputs
 * page (per Orlando's 31MAY2026 voice note): an input assigned to the
 * RECURRENT cycle is included in EVERY payroll cycle's calculation until its
 * status is changed away from "approved" or it's deleted. Stays out of cycle
 * dropdowns on pages that don't need it (Leaves, Attendance, etc.).
 */
export const RECURRENT_CYCLE_CODE = 'RECURRENT'

export const recurrentCycleOption: CycleOption = {
  value: RECURRENT_CYCLE_CODE,
  label: (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500" />
      <span>Recurrent</span>
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
        every cycle
      </span>
    </span>
  ),
}
