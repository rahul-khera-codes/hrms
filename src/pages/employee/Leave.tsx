import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, LayoutGrid, Table2, Search, ArrowUp, ArrowDown, Filter } from 'lucide-react'
import { getMyLeaveRequests, type LeaveRequestItem } from '@/lib/apiEmployee'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'
import { SkeletonTableRows } from '@/components/Skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

const CATEGORY_LABELS: Record<string, string> = {
  vacation: 'Vacaciones',
  marriage: 'Matrimonio',
  bereavement: 'Duelo',
  time_off: 'Tiempo Libre',
  maternity: 'Maternidad',
  paternity: 'Paternidad',
  medical_license: 'Licencia Médica',
}

const leaveCategoryOptions = [
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'marriage', label: 'Matrimonio' },
  { value: 'bereavement', label: 'Duelo' },
  { value: 'time_off', label: 'Tiempo Libre' },
  { value: 'maternity', label: 'Maternidad' },
  { value: 'paternity', label: 'Paternidad' },
  { value: 'medical_license', label: 'Licencia Médica' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EmployeeLeave() {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [filterLeaveType, setFilterLeaveType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')

  // Sort & Filter
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})
  const [filterOpen, setFilterOpen] = useState<string | null>(null)

  // Detail modal
  const [detailRow, setDetailRow] = useState<LeaveRequestItem | null>(null)

  const colAccessor = (r: LeaveRequestItem, col: string): string | number => {
    switch (col) {
      case 'Leave Type': return (CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '').toLowerCase()
      case 'Status': return r.status
      case 'Calculation': return (r.leaveCalculationType ?? '').toLowerCase()
      case 'Start Date': return r.startDate ?? ''
      case 'End Date': return r.endDate ?? ''
      case 'Days Off': return (r.associateDaysOff ?? '').toLowerCase()
      case 'Return Date': return r.returnDate ?? ''
      case 'Payable Days': return r.leavePayableDays ?? 0
      case 'Payable Amount': return r.leavePayableAmount ?? 0
      default: return ''
    }
  }

  function handleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  function handleColumnFilter(col: string, value: string) {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
  }

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const rows = await getMyLeaveRequests()
      setRequests(rows)
    } catch {
      setRequests([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }

  useEffect(() => {
    load(true)
    const handleVisibilityChange = () => {
      if (document.hidden) return
      load(false)
    }
    const intervalId = window.setInterval(() => {
      if (!document.hidden) load(false)
    }, 5000)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const displayedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = requests.filter((r) => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (filterLeaveType !== 'all' && r.leaveCategory !== filterLeaveType) return false
      if (!q) return true
      const categoryLabel = r.leaveCategory ? (CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory).toLowerCase() : ''
      return (
        categoryLabel.includes(q) ||
        (r.status ?? '').toLowerCase().includes(q) ||
        (r.startDate ?? '').includes(q) ||
        (r.endDate ?? '').includes(q) ||
        (r.reason ?? '').toLowerCase().includes(q)
      )
    })
    // Per-column filters
    for (const [col, val] of Object.entries(columnFilters)) {
      if (!val) continue
      const lower = val.toLowerCase()
      result = result.filter((r) => String(colAccessor(r, col)).toLowerCase().includes(lower))
    }
    // Sort
    if (sortCol) {
      result = [...result].sort((a, b) => {
        const av = colAccessor(a, sortCol)
        const bv = colAccessor(b, sortCol)
        if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
        const cmp = String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [requests, search, filterStatus, filterLeaveType, columnFilters, sortCol, sortDir])

  const summary = useMemo(() => ({
    total: displayedRows.length,
    pending: displayedRows.filter((r) => r.status === 'pending').length,
    approved: displayedRows.filter((r) => r.status === 'approved').length,
    rejected: displayedRows.filter((r) => r.status === 'rejected').length,
    payableAmount: displayedRows
      .filter((r) => r.status === 'approved')
      .reduce((a, r) => a + (r.leavePayableAmount ?? 0), 0),
  }), [displayedRows])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="My Leaves"
        subtitle="View your leave requests and status."
        icon={<CalendarCheck2 className="w-5 h-5" />}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="stat-card">
          <p className="stat-label">Total</p>
          <p className="stat-value">{summary.total}</p>
        </div>
        <div className="stat-card border-amber-200/70 bg-amber-50/40">
          <p className="stat-label text-amber-700">Pending</p>
          <p className="stat-value">{summary.pending}</p>
        </div>
        <div className="stat-card border-emerald-200/70 bg-emerald-50/40">
          <p className="stat-label text-emerald-700">Approved</p>
          <p className="stat-value">{summary.approved}</p>
        </div>
        <div className="stat-card border-red-200/70 bg-red-50/40">
          <p className="stat-label text-red-700">Rejected</p>
          <p className="stat-value">{summary.rejected}</p>
        </div>
        <div className="stat-card border-brand-200/70 bg-brand-50/40">
          <p className="stat-label text-brand-700">Payable Amount</p>
          <p className="stat-value">${summary.payableAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by type, status, or date"
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterLeaveType}
            onChange={(val) => setFilterLeaveType(val)}
            options={[
              { value: 'all', label: 'All leave types' },
              ...leaveCategoryOptions.map((opt) => ({ value: opt.value, label: opt.label })),
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as 'all' | 'pending' | 'approved' | 'rejected')}
            options={[
              { value: 'all', label: 'All status' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <div className="segmented">
            <button
              type="button"
              onClick={() => setViewMode('card')}
              className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Card
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}
            >
              <Table2 className="w-3.5 h-3.5" />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Data */}
      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <tbody>
                <SkeletonTableRows rows={6} cols={6} />
              </tbody>
            </table>
          </div>
        ) : viewMode === 'card' && displayedRows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
            <p className="empty-state-title">No matches</p>
            <p className="empty-state-description">{search ? 'No matches for your search.' : 'No leave requests found. Try adjusting your filters.'}</p>
            {Object.values(columnFilters).some(Boolean) && (
              <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                Clear column filters
              </button>
            )}
          </div>
        ) : viewMode === 'card' ? (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {displayedRows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 cursor-pointer"
                onClick={() => setDetailRow(r)}
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">
                    {r.startDate} - {r.endDate}
                    {r.leaveCategory ? <span className="text-surface-500 font-normal"> · {CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory}</span> : ''}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {r.leaveType === 'paid' ? 'Paid leave' : 'Unpaid leave'}
                    {r.associateDaysOff ? ` · Days off: ${r.associateDaysOff}` : ''}
                    {r.returnDate ? ` · Return: ${r.returnDate}` : ''}
                  </p>
                  {r.reason ? <p className="text-xs text-surface-500 mt-0.5">Reason: {r.reason}</p> : null}
                  {r.reviewedNote ? <p className="text-xs text-surface-500 mt-0.5">Note: {r.reviewedNote}</p> : null}
                  {r.status === 'approved' && r.leavePayableAmount != null && r.leavePayableAmount > 0 ? (
                    <p className="text-xs font-medium text-brand-700 mt-0.5 tabular-nums">
                      Approved leave pay: ${r.leavePayableAmount.toFixed(2)}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize shrink-0 self-start sm:self-auto ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto scroll-fade-x">
            <table className="min-w-[900px] w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-50 border-b border-surface-200">
                <tr>
                  {[
                    'Leave Type',
                    'Status',
                    'Calculation',
                    'Start Date',
                    'End Date',
                    'Days Off',
                    'Return Date',
                    'Payable Days',
                    'Payable Amount',
                  ].map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-1.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap border-b border-surface-200 ${['Payable Days', 'Payable Amount'].includes(col) ? 'text-right' : ''}`}
                    >
                      <div className="flex items-center gap-0.5">
                        <button type="button" className="flex items-center gap-0.5 hover:text-surface-700 transition-colors" onClick={() => handleSort(col)}>
                          {col}
                          {sortCol === col && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                        </button>
                        <button type="button" className={`p-0.5 rounded hover:bg-surface-200/60 transition-colors ${columnFilters[col] ? 'text-brand-600' : 'text-surface-400'}`} onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === col ? null : col) }}>
                          <Filter className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      {filterOpen === col && (
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <input type="text" value={columnFilters[col] ?? ''} onChange={(e) => handleColumnFilter(col, e.target.value)} placeholder={`Filter ${col}...`} className="w-full text-[10px] font-normal normal-case tracking-normal border border-surface-200 rounded px-1.5 py-1 bg-white focus:ring-1 focus:ring-brand-300 outline-none" autoFocus />
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-surface-400 mb-3">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-medium text-surface-700">No matches</p>
                        <p className="text-xs text-surface-500 mt-1">Try adjusting your search or column filters.</p>
                        {Object.values(columnFilters).some(Boolean) && (
                          <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => { setColumnFilters({}); setFilterOpen(null) }}>
                            Clear column filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {displayedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-surface-100 hover:bg-brand-50/40 transition-colors cursor-pointer"
                    onClick={() => setDetailRow(r)}
                  >
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">{CATEGORY_LABELS[r.leaveCategory ?? ''] || r.leaveCategory || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">
                      {r.leaveCalculationType === 'non_payable' ? 'Non Payable' : r.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : r.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '-'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.startDate ?? ''}{r.startTime ? ` ${r.startTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.endDate ?? ''}{r.endTime ? ` ${r.endTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 whitespace-nowrap">{r.associateDaysOff ?? '-'}</td>
                    <td className="px-3 py-2 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.returnDate ?? ''}{r.returnTime ? ` ${r.returnTime}` : ''}</td>
                    <td className="px-3 py-2 text-xs text-surface-700 tabular-nums whitespace-nowrap text-right">{r.leavePayableDays != null ? r.leavePayableDays : '-'}</td>
                    <td className={`px-3 py-2 text-xs tabular-nums whitespace-nowrap text-right font-semibold ${r.leavePayableAmount != null && r.leavePayableAmount > 0 ? 'text-brand-700' : 'text-surface-400'}`}>
                      {r.leavePayableAmount != null ? `$${r.leavePayableAmount.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal (read-only) */}
      {detailRow && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDetailRow(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white shadow-xl">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white rounded-t-2xl border-b border-surface-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-surface-900">Leave Detail</h2>
                <p className="text-xs text-surface-500 mt-0.5">
                  {CATEGORY_LABELS[detailRow.leaveCategory ?? ''] || detailRow.leaveCategory || 'Leave'} &middot;{' '}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${statusColors[detailRow.status] || 'bg-surface-100 text-surface-600'}`}>
                    {detailRow.status}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="p-2 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Dates */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Dates</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center rounded-lg bg-white border border-surface-100 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Start</p>
                    <p className="text-xs font-semibold text-surface-800 mt-0.5 font-mono">{detailRow.startDate ?? '--'}</p>
                    {detailRow.startTime && <p className="text-[10px] text-surface-500 font-mono">{detailRow.startTime}</p>}
                  </div>
                  <div className="text-center rounded-lg bg-white border border-surface-100 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 uppercase">End</p>
                    <p className="text-xs font-semibold text-surface-800 mt-0.5 font-mono">{detailRow.endDate ?? '--'}</p>
                    {detailRow.endTime && <p className="text-[10px] text-surface-500 font-mono">{detailRow.endTime}</p>}
                  </div>
                  <div className="text-center rounded-lg bg-white border border-surface-100 py-2 px-1">
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Return</p>
                    <p className="text-xs font-semibold text-surface-800 mt-0.5 font-mono">{detailRow.returnDate ?? '--'}</p>
                    {detailRow.returnTime && <p className="text-[10px] text-surface-500 font-mono">{detailRow.returnTime}</p>}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Type</p>
                    <p className="text-sm font-semibold text-surface-800 mt-0.5">{detailRow.leaveType === 'paid' ? 'Paid' : 'Unpaid'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Days Off</p>
                    <p className="text-sm font-semibold text-surface-800 mt-0.5">{detailRow.associateDaysOff ?? '--'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Calculation</p>
                    <p className="text-sm font-semibold text-surface-800 mt-0.5">
                      {detailRow.leaveCalculationType === 'non_payable' ? 'Non Payable' : detailRow.leaveCalculationType === 'hourly_salary' ? 'Hourly Salary' : detailRow.leaveCalculationType === 'monthly_salary' ? 'Monthly Salary' : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-surface-400 uppercase">Payable Days</p>
                    <p className="text-sm font-semibold text-surface-800 mt-0.5">{detailRow.leavePayableDays ?? '--'}</p>
                  </div>
                </div>
              </div>

              {/* Pay */}
              {detailRow.leavePayableAmount != null && detailRow.leavePayableAmount > 0 && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
                  <p className="text-[10px] font-semibold text-brand-700 uppercase tracking-wider mb-1">Payable Amount</p>
                  <p className="text-xl font-bold text-brand-700 tabular-nums">${detailRow.leavePayableAmount.toFixed(2)}</p>
                </div>
              )}

              {/* Reason & Notes */}
              {detailRow.reason && (
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Reason</p>
                  <p className="text-sm text-surface-700">{detailRow.reason}</p>
                </div>
              )}
              {detailRow.reviewedNote && (
                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                  <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-2">Reviewer Note</p>
                  <p className="text-sm text-surface-700">{detailRow.reviewedNote}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
