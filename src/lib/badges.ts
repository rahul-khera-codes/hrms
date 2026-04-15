/**
 * Centralized status → badge-class mapping.
 * Use these helpers instead of hardcoded `bg-emerald-100 text-emerald-700` strings,
 * so all status colors stay semantic and consistent across pages.
 */

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral' | 'violet'

const BADGE_CLASS: Record<StatusVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  brand: 'badge-brand',
  neutral: 'badge-neutral',
  violet: 'badge-violet',
}

export function badgeClass(variant: StatusVariant): string {
  return BADGE_CLASS[variant] ?? BADGE_CLASS.neutral
}

/** Map common status strings to a semantic badge variant. */
export function statusVariant(status: string | null | undefined): StatusVariant {
  const s = String(status ?? '').toLowerCase().trim()
  switch (s) {
    case 'active':
    case 'approved':
    case 'present':
    case 'completed':
    case 'paid':
    case 'success':
      return 'success'
    case 'pending':
    case 'late':
    case 'partial':
    case 'review':
      return 'warning'
    case 'rejected':
    case 'absent':
    case 'inactive':
    case 'failed':
    case 'error':
    case 'terminated':
      return 'danger'
    case 'leave':
    case 'on_leave':
    case 'holiday':
      return 'info'
    case 'unpaid':
    case 'draft':
    case 'archived':
      return 'neutral'
    default:
      return 'neutral'
  }
}

/** One-shot helper: takes a status string, returns the right badge class. */
export function statusBadgeClass(status: string | null | undefined): string {
  return badgeClass(statusVariant(status))
}
