import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface DetailModalHeaderProps {
  employeeName: string
  cmid?: number | string | null
  reportsTo?: string | null
  accountName?: string | null
  onClose: () => void
  extra?: ReactNode
}

/**
 * Standard detail-modal header per client feedback (14APR2026):
 *   1. Employee Name
 *   2. CMID (Callmax ID)
 *   3. Reports To
 *
 * These three items must always be at the top of detail modals.
 */
export function DetailModalHeader({
  employeeName,
  cmid,
  reportsTo,
  accountName,
  onClose,
  extra,
}: DetailModalHeaderProps) {
  return (
    <div className="modal-header">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0 text-sm font-semibold">
          {employeeName ? employeeName.charAt(0).toUpperCase() : '—'}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50 truncate">{employeeName}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-[11px] font-mono font-medium text-surface-700 dark:text-surface-200">
              {`CMID: ${cmid ?? '-'}`}
            </span>
            {reportsTo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-[11px] font-medium text-surface-700 dark:text-surface-200">
                Reports to: {reportsTo}
              </span>
            )}
            {accountName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 border border-brand-100 text-[11px] font-medium text-brand-700">
                Primary Account: {accountName}
              </span>
            )}
            {extra}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-2.5 min-w-[2.75rem] min-h-[2.75rem] rounded-lg text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 shrink-0 transition-colors flex items-center justify-center"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
