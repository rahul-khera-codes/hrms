// 10JUN2026 client video — Orlando's notes file included "Payroll
// Calendar — Payroll status upcoming for upcoming vs current" but he
// didn't explain it verbally. The most sensible interpretation given
// the rest of the conversation: surface the cycle's state (Upcoming /
// Current / In Process / Closed) wherever a payroll cycle code shows
// up in the app — Payroll Inputs rows, Leaves rows, Payroll Calculator
// — so admins can see at a glance whether a record is tied to the
// active cycle or to a future/past one.
//
// The four-state model + colors come from PayrollCalendar.tsx where it
// already lives. Extracted here so the tables don't need to duplicate
// the date math or the Tailwind classes.

import type { PayrollPeriod } from './apiAdmin'

export type CycleState = 'upcoming' | 'current' | 'in_process' | 'closed' | 'unknown'

export function cycleStateFor(cycleCode: string | null | undefined, periods: PayrollPeriod[], now: Date = new Date()): CycleState {
  if (!cycleCode) return 'unknown'
  // 'RECURRENT' is a special sentinel for repeating payroll inputs; not
  // a single cycle, so it doesn't have a single state.
  if (cycleCode === 'RECURRENT') return 'unknown'
  const p = periods.find((x) => x.cycleCode === cycleCode)
  if (!p) return 'unknown'
  const fromD = new Date(p.periodFrom)
  const toD = new Date(p.periodTo)
  const payD = new Date(p.payDate)
  if (now > payD) return 'closed'
  if (now >= fromD && now <= toD) return 'current'
  if (now > toD && now <= payD) return 'in_process'
  return 'upcoming'
}

export function cycleStateLabel(state: CycleState): string {
  switch (state) {
    case 'closed': return 'Closed'
    case 'current': return 'Current'
    case 'in_process': return 'In Process'
    case 'upcoming': return 'Upcoming'
    default: return ''
  }
}

/** Tailwind class string for a tiny badge next to a cycle code. */
export function cycleStateBadgeClass(state: CycleState): string {
  switch (state) {
    case 'closed':
      return 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700'
    case 'current':
      return 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
    case 'in_process':
      return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
    case 'upcoming':
      return 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
    default:
      return ''
  }
}
