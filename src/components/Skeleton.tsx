/**
 * Skeleton primitives for loading states.
 * Replaces "Loading..." text with shape-aware placeholders that feel faster.
 */

interface SkeletonBaseProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonBaseProps) {
  return <span className={`inline-block bg-surface-200/70 rounded animate-pulse ${className}`} />
}

interface SkeletonRowsProps {
  rows?: number
  cols?: number
  /** True when the parent wraps in `.card` so we render rounded edges only on first/last rows. */
  bordered?: boolean
}

/**
 * Renders N skeleton table rows with M columns.
 * Use as direct child of a `<tbody>`.
 */
export function SkeletonTableRows({ rows = 5, cols = 5 }: SkeletonRowsProps) {
  const rowsArr = Array.from({ length: rows })
  const colsArr = Array.from({ length: cols })
  return (
    <>
      {rowsArr.map((_, r) => (
        <tr key={r} className="border-b border-surface-100">
          {colsArr.map((_, c) => (
            <td key={c} className="px-3 py-3">
              <Skeleton className={c === 0 ? 'h-3 w-24' : c === cols - 1 ? 'h-3 w-12' : 'h-3 w-32'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/**
 * Standalone skeleton card for non-table layouts (dashboard cards, list items).
 */
export function SkeletonCard({ className = '' }: SkeletonBaseProps) {
  return (
    <div className={`card p-4 sm:p-5 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  )
}

/**
 * Block of skeleton list items, useful for sidebar/list loading states.
 */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 p-3 rounded-xl border border-surface-200/70 bg-white">
          <Skeleton className="w-9 h-9 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </li>
      ))}
    </ul>
  )
}
