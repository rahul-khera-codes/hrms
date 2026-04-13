import { useEffect, useMemo, useState } from 'react'
import { Calendar, CalendarCheck2, Clock3, Send, LayoutGrid, Table2 } from 'lucide-react'
import { createLeaveRequest, getMyLeaveRequests, type LeaveRequestItem } from '@/lib/apiEmployee'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

type LeaveCategory = 'marriage' | 'bereavement' | 'time_off' | 'maternity' | 'paternity' | 'medical_license' | 'vacation'
const leaveCategoryOptions: Array<{ value: LeaveCategory; label: string }> = [
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'marriage', label: 'Matrimonio' },
  { value: 'bereavement', label: 'Duelo' },
  { value: 'time_off', label: 'Tiempo Libre' },
  { value: 'maternity', label: 'Maternidad' },
  { value: 'paternity', label: 'Paternidad' },
  { value: 'medical_license', label: 'Licencia Médica' },
]

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

const CATEGORY_LABELS: Record<string, string> = {
  vacation: 'Vacaciones',
  marriage: 'Matrimonio',
  bereavement: 'Duelo',
  time_off: 'Tiempo Libre',
  maternity: 'Maternidad',
  paternity: 'Paternidad',
  medical_license: 'Licencia Médica',
}

function splitDateTimeValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60000
  const value = new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  }
}

export default function EmployeeLeave() {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('time_off')
  const [daysOff, setDaysOff] = useState<string[]>(['Sun', 'Sat'])
  const initialDateTime = splitDateTimeValue(new Date())
  const [startDate, setStartDate] = useState(initialDateTime.date)
  const [startTime, setStartTime] = useState(initialDateTime.time)
  const [endDate, setEndDate] = useState(initialDateTime.date)
  const [endTime, setEndTime] = useState(initialDateTime.time)
  const [returnDate, setReturnDate] = useState(initialDateTime.date)
  const [returnTime, setReturnTime] = useState(initialDateTime.time)
  const todayDate = new Date().toISOString().slice(0, 10)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const [requestsView, setRequestsView] = useState<'card' | 'table'>('table')

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

  function toggleDayOff(day: string) {
    setDaysOff((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (startDate < todayDate || endDate < todayDate || returnDate < todayDate) {
      setNotice('Past dates are not allowed. Please select today or a future date.')
      return
    }
    const startDateTimeValue = `${startDate}T${startTime}`
    const endDateTimeValue = `${endDate}T${endTime}`
    const returnDateTimeValue = `${returnDate}T${returnTime}`
    const start = new Date(startDateTimeValue)
    const end = new Date(endDateTimeValue)
    const ret = new Date(returnDateTimeValue)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setNotice('End date must be at least one day after start date.')
      return
    }
    if (endDate === returnDate) {
      setNotice('Return date must be different from end date.')
      return
    }
    if (Number.isNaN(ret.getTime()) || ret < end) {
      setNotice('Return date must be same or after end date.')
      return
    }

    setSaving(true)
    try {
      const leaveType = leaveCategory === 'time_off' ? 'unpaid' : 'paid'
      await createLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
        leaveCategory,
        associateDaysOff: daysOff,
        returnDate,
        startTime,
        endTime,
        returnTime,
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
    <div className="page overflow-x-hidden">
      {notice && (
        <div className="fixed right-4 top-4 z-50 alert-success shadow-lg">
          <span>{notice}</span>
        </div>
      )}

      <PageHeader
        title="My Leave"
        subtitle="Submit leave requests and track approvals."
        icon={<CalendarCheck2 className="w-5 h-5" />}
      />

      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900">New leave request</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Fill in your leave details below</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Leave Type */}
            <div className="sm:col-span-2">
              <label className="label">Leave Type</label>
              <AdminSelect
                value={leaveCategory}
                onChange={(val) => setLeaveCategory(val as LeaveCategory)}
                options={leaveCategoryOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </div>

            {/* Associate Days Off — multi-select chips */}
            <div className="sm:col-span-2">
              <label className="label">Associate Days Off</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDayOff(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${
                      daysOff.includes(day)
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-surface-600 border-surface-200 hover:bg-surface-50'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
              {daysOff.length > 0 && (
                <p className="text-xs text-surface-500 mt-1">{daysOff.join(', ')}</p>
              )}
            </div>

            {/* Start Date & Time */}
            <div>
              <label className="label">Start Date & Time</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={todayDate}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
                <div className="relative">
                  <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>

            {/* End Date & Time */}
            <div>
              <label className="label">End Date & Time</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={todayDate}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
                <div className="relative">
                  <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>

            {/* Return Date & Time */}
            <div className="sm:col-span-2">
              <label className="label">Return Date & Time</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="relative">
                  <Calendar className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    min={todayDate}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
                <div className="relative">
                  <Clock3 className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="input w-full rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="input"
              placeholder="Short reason"
            />
          </div>
          <div className="flex justify-end pt-2 border-t border-surface-100">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              <Send className="w-4 h-4" />
              {saving ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-surface-100 border border-surface-200 text-surface-600 flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900">My requests</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Track the status of your leave requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && <span className="badge-warning">{pendingCount} pending</span>}
            {requests.length > 0 && (
              <div className="segmented">
                <button
                  type="button"
                  onClick={() => setRequestsView('card')}
                  className={`segmented-item ${requestsView === 'card' ? 'segmented-item-active' : ''}`}
                  aria-label="Card view"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRequestsView('table')}
                  className={`segmented-item ${requestsView === 'table' ? 'segmented-item-active' : ''}`}
                  aria-label="Table view"
                >
                  <Table2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div className="p-6 flex items-center gap-3 text-surface-500 text-sm">
            <div className="spinner" /> Loading requests…
          </div>
        ) : requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><CalendarCheck2 className="w-5 h-5" /></div>
            <p className="empty-state-title">No leave requests yet</p>
            <p className="empty-state-description">Submit your first request using the form above.</p>
          </div>
        ) : requestsView === 'card' ? (
          <ul className="p-3 sm:p-4 space-y-2">
            {requests.map((r) => {
              const statusBadgeClass = r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'
              return (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-xl border border-surface-200/70 bg-white hover:shadow-card-hover hover:border-brand-200/70 transition-all"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0 text-brand-600">
                    <CalendarCheck2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-surface-900 tabular-nums">
                      {r.startDate} → {r.endDate}
                      {r.leaveCategory ? <span className="text-surface-500 font-normal"> · {CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory}</span> : null}
                    </p>
                    <p className="text-[11px] text-surface-500 mt-0.5">
                      <span className={r.leaveType === 'paid' ? 'badge-brand mr-1' : 'badge-neutral mr-1'}>
                        {r.leaveType === 'paid' ? 'Paid' : 'Unpaid'}
                      </span>
                      {r.associateDaysOff ? `Days off: ${r.associateDaysOff}` : ''}
                      {r.returnDate ? ` · Return: ${r.returnDate}` : ''}
                    </p>
                    {r.reason ? <p className="text-[11px] text-surface-600 mt-1 italic">"{r.reason}"</p> : null}
                    {r.status === 'approved' && r.leavePayableAmount != null && r.leavePayableAmount > 0 ? (
                      <p className="text-[11px] font-semibold text-brand-700 mt-1 tabular-nums">
                        Approved pay: ${r.leavePayableAmount.toFixed(2)}
                      </p>
                    ) : null}
                    {r.reviewedNote ? (
                      <p className="text-[11px] text-surface-500 mt-1">Note: {r.reviewedNote}</p>
                    ) : null}
                  </div>
                  <span className={`${statusBadgeClass} self-start sm:self-auto capitalize shrink-0`}>
                    {r.status}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Leave Type</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Type</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Start</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">End</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Return</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Days Off</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">Pay</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const statusBadgeClass = r.status === 'approved' ? 'badge-success' : r.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                  return (
                    <tr key={r.id} className="border-b border-surface-100 hover:bg-brand-50/30 transition-colors">
                      <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">
                        {r.leaveCategory ? (CATEGORY_LABELS[r.leaveCategory] || r.leaveCategory) : '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={r.leaveType === 'paid' ? 'badge-brand' : 'badge-neutral'}>
                          {r.leaveType === 'paid' ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.startDate ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.endDate ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">{r.returnDate ?? '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-surface-600 whitespace-nowrap">{r.associateDaysOff ?? '-'}</td>
                      <td className={`px-3 py-2.5 text-xs tabular-nums whitespace-nowrap text-right font-semibold ${r.leavePayableAmount != null && r.leavePayableAmount > 0 ? 'text-brand-700' : 'text-surface-400'}`}>
                        {r.leavePayableAmount != null && r.leavePayableAmount > 0 ? `$${r.leavePayableAmount.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`${statusBadgeClass} capitalize`}>{r.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
