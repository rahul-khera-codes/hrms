import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2 } from 'lucide-react'
import { getAdminLeaveRequests, reviewAdminLeaveRequest, type AdminLeaveRequest } from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function AdminLeaveRequests() {
  const [rows, setRows] = useState<AdminLeaveRequest[]>([])
  const [allRows, setAllRows] = useState<AdminLeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [notice, setNotice] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function load(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const [filteredData, allData] = await Promise.all([
        getAdminLeaveRequests(filterStatus),
        getAdminLeaveRequests('all'),
      ])
      setRows(filteredData)
      setAllRows(allData)
    } catch {
      setRows([])
      setAllRows([])
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
      if (!document.hidden) {
        load(false)
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [filterStatus])

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const summary = useMemo(() => {
    return {
      total: allRows.length,
      pending: allRows.filter((r) => r.status === 'pending').length,
      approved: allRows.filter((r) => r.status === 'approved').length,
      rejected: allRows.filter((r) => r.status === 'rejected').length,
    }
  }, [allRows])

  function openReview(row: AdminLeaveRequest) {
    setReviewingId(row.id)
    setReviewStatus('approved')
    setReviewNote('')
  }

  async function submitReview() {
    if (!reviewingId) return
    setSaving(true)
    try {
      await reviewAdminLeaveRequest(reviewingId, {
        status: reviewStatus,
        reviewedNote: reviewNote.trim() || undefined,
      })
      setNotice('Leave request updated.')
      setReviewingId(null)
      await load(false)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to update leave request.'
      setNotice(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      {notice && (
        <div className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 shadow-lg">
          {notice}
        </div>
      )}

      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Leave requests</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Review and approve employee leave requests.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Total</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-amber-700 uppercase tracking-wider">Pending</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.pending}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-emerald-700 uppercase tracking-wider">Approved</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.approved}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-red-200/80 bg-red-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-red-700 uppercase tracking-wider">Rejected</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.rejected}</p>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="w-full sm:w-64">
          <label className="label">Filter status</label>
          <AdminSelect
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as 'all' | 'pending' | 'approved' | 'rejected')}
            options={[
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-surface-500 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No leave requests found.</div>
        ) : (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">{r.employeeName}</p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {r.startDate} - {r.endDate} · {r.leaveType === 'paid' ? 'Paid leave' : 'Unpaid leave'}
                  </p>
                  {r.reason ? <p className="text-xs text-surface-500 mt-0.5">Reason: {r.reason}</p> : null}
                  {r.reviewedNote ? <p className="text-xs text-surface-500 mt-0.5">Note: {r.reviewedNote}</p> : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}>
                    {r.status}
                  </span>
                  {r.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => openReview(r)}
                      className="btn-secondary rounded-xl px-3 py-2 text-xs"
                    >
                      Review
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {reviewingId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => setReviewingId(null)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-surface-900">Review leave request</h2>
            <p className="mt-1 text-sm text-surface-500">Approve or reject this request.</p>

            <div className="mt-4 space-y-3">
              <AdminSelect
                value={reviewStatus}
                onChange={(val) => setReviewStatus(val as 'approved' | 'rejected')}
                options={[
                  { value: 'approved', label: 'Approve' },
                  { value: 'rejected', label: 'Reject' },
                ]}
              />
              <textarea
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                rows={3}
                className="input w-full rounded-xl"
                placeholder="Optional note"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewingId(null)}
                className="btn-secondary rounded-xl px-4 py-2"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReview}
                className="btn-primary rounded-xl px-4 py-2"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
