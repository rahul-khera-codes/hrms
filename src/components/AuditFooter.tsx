import { fmtFullDateTime } from '@/lib/timeFormat'

// 10JUN2026 client video Item 11 — Orlando asked that Created By / Created
// On / Modified By / Modified On appear on every editable form, all wrapped
// in the same gray "footer box" that Attendance + Leaves + Payroll Inputs
// already use. This shared component is that footer, so Accounts, Payroll
// Calculations, and Employees can drop it in and match the styling
// without duplicating 20 lines of grid JSX in each form.

export interface AuditFooterProps {
  createdByName?: string | null
  createdOn?: string | null
  modifiedByName?: string | null
  modifiedOn?: string | null
}

export function AuditFooter({
  createdByName,
  createdOn,
  modifiedByName,
  modifiedOn,
}: AuditFooterProps) {
  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] text-surface-600 dark:text-surface-300">
      <div>
        <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created By</p>
        <p className="text-surface-800 dark:text-surface-100">{createdByName || '—'}</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Created On</p>
        <p className="text-surface-800 dark:text-surface-100 tabular-nums">{createdOn ? fmtFullDateTime(createdOn) : '—'}</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified By</p>
        <p className="text-surface-800 dark:text-surface-100">{modifiedByName || '—'}</p>
      </div>
      <div>
        <p className="font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-0.5">Modified On</p>
        <p className="text-surface-800 dark:text-surface-100 tabular-nums">{modifiedOn ? fmtFullDateTime(modifiedOn) : '—'}</p>
      </div>
    </div>
  )
}
