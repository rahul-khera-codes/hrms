import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface BulkActionBarProps {
  count: number
  onClear: () => void
  /** Action buttons (use btn-* classes inside). */
  children: ReactNode
}

/**
 * Sticky bottom action bar that appears when at least one row is selected.
 * Place at the page level (under the table) so it floats above bottom of viewport.
 */
export function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count <= 0) return null
  return (
    <div className="fixed bottom-4 inset-x-0 z-30 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl px-3 py-2 sm:px-4 sm:py-2.5 max-w-[calc(100vw-1.5rem)]">
        <span className="text-xs sm:text-sm font-medium text-surface-700 dark:text-surface-200 whitespace-nowrap">
          <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100 text-xs font-semibold mr-2 tabular-nums">
            {count}
          </span>
          selected
        </span>
        <div className="h-6 w-px bg-surface-200 hidden sm:block" />
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">{children}</div>
        <button
          type="button"
          onClick={onClear}
          className="btn-icon text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 ml-1 shrink-0"
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
