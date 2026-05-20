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
