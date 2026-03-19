import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, CalendarCheck2, Clock3, Send } from 'lucide-react'
import { createLeaveRequest, getMyLeaveRequests, type LeaveRequestItem } from '@/lib/apiEmployee'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

type CalculationType = 'non_payable' | 'hourly_salary' | 'monthly_salary'
type LeaveCategory = 'marriage' | 'bereavement' | 'time_off' | 'maternity' | 'paternity' | 'medical_license'

const dayOptions = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const leaveCategoryOptions: Array<{ value: LeaveCategory; label: string }> = [
  { value: 'marriage', label: 'Marriage' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'time_off', label: 'Time Off' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'medical_license', label: 'Medical License' },
]

function toDateTimeLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function splitDateTimeValue(date: Date) {
  const value = toDateTimeLocalInputValue(date)
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  }
}

function formatCalculationType(value: CalculationType) {
  if (value === 'non_payable') return 'Non-Payable'
  if (value === 'hourly_salary') return 'Hourly Salary'
  return 'Monthly Salary'
}

export default function EmployeeLeave() {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('time_off')
  const [calculationType, setCalculationType] = useState<CalculationType>('non_payable')
  const [daysOff, setDaysOff] = useState<string[]>([])
  const [daysOffOpen, setDaysOffOpen] = useState(false)
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
  const daysOffRef = useRef<HTMLDivElement | null>(null)

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

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (!daysOffRef.current) return
      if (!daysOffRef.current.contains(e.target as Node)) {
        setDaysOffOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const pendingCount = useMemo(() => requests.filter((r) => r.status === 'pending').length, [requests])

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
    if (Number.isNaN(ret.getTime()) || ret < end) {
      setNotice('Return date must be same or after end date.')
      return
    }

    setSaving(true)
    try {
      const leaveType = calculationType === 'non_payable' ? 'unpaid' : 'paid'
      const baseReason = reason.trim()
      const details = [
        `Leave Type: ${leaveCategoryOptions.find((opt) => opt.value === leaveCategory)?.label ?? 'Time Off'}`,
        `Calculation Type: ${formatCalculationType(calculationType)}`,
        `Days Off: ${daysOff.length ? daysOff.join(', ') : 'None'}`,
        `Start DateTime: ${startDateTimeValue}`,
        `End DateTime: ${endDateTimeValue}`,
        `Return DateTime: ${returnDateTimeValue}`,
      ].join(' | ')
      await createLeaveRequest({
        leaveType,
        startDate,
        endDate,
        reason: [baseReason, details].filter(Boolean).join(' || ') || undefined,
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Leave Type</label>
              <AdminSelect
                value={leaveCategory}
                onChange={(val) => setLeaveCategory(val as LeaveCategory)}
                options={leaveCategoryOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </div>
            <div>
              <label className="label">Calculation Type</label>
              <AdminSelect
                value={calculationType}
                onChange={(val) => setCalculationType(val as CalculationType)}
                options={[
                  { value: 'non_payable', label: 'Non-Payable' },
                  { value: 'hourly_salary', label: 'Hourly Salary' },
                  { value: 'monthly_salary', label: 'Monthly Salary' },
                ]}
              />
            </div>
            <div>
              <label className="label">Days Off</label>
              <div ref={daysOffRef} className="relative">
                <button
                  type="button"
                  onClick={() => setDaysOffOpen((prev) => !prev)}
                  className="input w-full rounded-xl min-h-[2.75rem] flex items-center justify-between px-3 py-2 text-left"
                >
                  <span className="truncate text-sm text-surface-700">
                    {daysOff.length ? daysOff.join(', ') : 'Select days'}
                  </span>
                  <span className="ml-2 text-surface-400">▾</span>
                </button>
                {daysOffOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-surface-200 bg-white shadow-lg max-h-60 overflow-auto p-2">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {dayOptions.map((day) => {
                        const selected = daysOff.includes(day)
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => {
                              setDaysOff((prev) =>
                                prev.includes(day)
                                  ? prev.filter((d) => d !== day)
                                  : [...prev, day]
                              )
                            }}
                            className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${selected ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-surface-200 bg-white text-surface-600 hover:bg-surface-50'}`}
                          >
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="label">Start Date</label>
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
            <div>
              <label className="label">End Date</label>
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
            <div className="sm:col-span-2">
              <label className="label">Return Date</label>
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
