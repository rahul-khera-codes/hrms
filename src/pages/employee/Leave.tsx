import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CalendarCheck2, Send } from 'lucide-react'
import { createLeaveRequest, getMyLeaveRequests, type LeaveRequestItem } from '@/lib/apiEmployee'
import AdminDatePicker from '@/components/AdminDatePicker'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

export default function EmployeeLeave() {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [leaveType, setLeaveType] = useState<'paid' | 'unpaid'>('unpaid')
  const [startDate, setStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')

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
      if (!document.hidden) {
        load(false)
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeoutId = window.setTimeout(() => setNotice(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [notice])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const start = new Date(`${startDate}T00:00:00Z`)
    const end = new Date(`${endDate}T00:00:00Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setNotice('End date must be at least one day after start date.')
      return
    }

    setSaving(true)
    try {
      await createLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      })
      setReason('')
      setNotice('Leave request submitted.')
      await load(false)
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to submit leave request.'
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
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">My Leave</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Submit leave requests and track approvals.</p>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-4">New leave request</h2>
        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Type</label>
              <AdminSelect
                value={leaveType}
                onChange={(val) => setLeaveType(val as 'paid' | 'unpaid')}
                options={[
                  { value: 'unpaid', label: 'Unpaid leave' },
                  { value: 'paid', label: 'Paid leave' },
                ]}
              />
            </div>
            <div>
              <label className="label">Start date</label>
              <AdminDatePicker value={startDate} onChange={(val) => setStartDate(val)} />
            </div>
            <div>
              <label className="label">End date</label>
              <AdminDatePicker value={endDate} onChange={(val) => setEndDate(val)} />
            </div>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input w-full rounded-xl"
              placeholder="Short reason"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary rounded-xl min-h-[2.75rem] px-4 inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </form>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 pt-4 sm:pt-5">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900">My requests</h2>
          <p className="text-xs sm:text-sm text-surface-500 mt-1">Pending: {pendingCount}</p>
        </div>
        {loading ? (
          <div className="p-8 text-center text-surface-500 text-sm">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-surface-500 text-sm">No leave requests yet.</div>
        ) : (
          <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <CalendarCheck2 className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">
                    {r.startDate} - {r.endDate}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    {r.leaveType === 'paid' ? 'Paid leave' : 'Unpaid leave'}{r.reason ? ` · ${r.reason}` : ''}
                  </p>
                  {r.reviewedNote ? (
                    <p className="text-xs text-surface-500 mt-0.5">Note: {r.reviewedNote}</p>
                  ) : null}
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}>
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
