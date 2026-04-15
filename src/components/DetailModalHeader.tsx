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
          <h2 className="text-base font-semibold text-surface-900 truncate">{employeeName}</h2>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-[11px] font-mono font-medium text-surface-700">
              CMID {cmid ?? '-'}
            </span>
            {reportsTo && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-surface-100 text-[11px] font-medium text-surface-700">
                Reports to: {reportsTo}
              </span>
            )}
            {accountName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-brand-50 border border-brand-100 text-[11px] font-medium text-brand-700">
                {accountName}
              </span>
            )}
            {extra}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="btn-icon text-surface-400 hover:text-surface-700 hover:bg-surface-100 shrink-0"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
