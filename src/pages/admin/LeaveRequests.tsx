import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck2, Lock } from 'lucide-react'
import {
  getAdminLeaveRequests,
  getLeaveReviewContext,
  reviewAdminLeaveRequest,
  type AdminLeaveRequest,
  type LeaveReviewContext,
} from '@/lib/apiAdmin'
import AdminSelect from '@/components/AdminSelect'

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

type LeaveCalcType = 'non_payable' | 'hourly_salary' | 'monthly_salary'

function hourlyRateFromEmployee(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  wd: number,
  hd: number
) {
  const n = Number(baseSalary) || 0
  if (salaryType === 'monthly') return n / wd / hd
  return n
}

/** Mirrors backend `leavePayComputation.js` for live preview. */
function previewLeavePay(
  salaryType: 'hourly' | 'monthly',
  baseSalary: number,
  workingDaysPerMonth: number,
  hoursPerDay: number,
  calculationType: LeaveCalcType,
  payableDays: number
) {
  const wd = Number(workingDaysPerMonth) || 23.83
  const hd = Number(hoursPerDay) || 8
  const base = Number(baseSalary) || 0
  if (calculationType === 'non_payable') {
    const hr = hourlyRateFromEmployee(salaryType, base, wd, hd)
    return {
      hourlyRate: Math.round(hr * 10000) / 10000,
      dailyHours: hd,
      dailySalary: 0,
      payableAmount: 0,
    }
  }
  let dailySalary = 0
  if (calculationType === 'hourly_salary') {
    dailySalary = hourlyRateFromEmployee(salaryType, base, wd, hd) * hd
  } else {
    dailySalary = salaryType === 'monthly' ? base / wd : base * hd
  }
  const pd = Math.max(0, payableDays || 0)
  return {
    hourlyRate: Math.round(hourlyRateFromEmployee(salaryType, base, wd, hd) * 10000) / 10000,
    dailyHours: hd,
    dailySalary: Math.round(dailySalary * 10000) / 10000,
    payableAmount: Math.round(dailySalary * pd * 100) / 100,
  }
}

export default function AdminLeaveRequests() {
  const [rows, setRows] = useState<AdminLeaveRequest[]>([])
  const [allRows, setAllRows] = useState<AdminLeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending')
  const [notice, setNotice] = useState('')
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewContext, setReviewContext] = useState<LeaveReviewContext | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [reviewStatus, setReviewStatus] = useState<'approved' | 'rejected'>('approved')
  const [reviewNote, setReviewNote] = useState('')
  const [calculationType, setCalculationType] = useState<LeaveCalcType>('hourly_salary')
  const [payableDaysInput, setPayableDaysInput] = useState('0')
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

  const preview = useMemo(() => {
    if (!reviewContext) return null
    const { employee, settings } = reviewContext
    const isUnpaid = reviewContext.leave.leaveType === 'unpaid'
    const ct: LeaveCalcType = isUnpaid ? 'non_payable' : calculationType
    const pd = parseFloat(payableDaysInput)
    return previewLeavePay(
      employee.salaryType,
      employee.baseSalary,
      settings.workingDaysPerMonth,
      settings.hoursPerDay,
      ct,
      Number.isFinite(pd) ? pd : 0
    )
  }, [reviewContext, calculationType, payableDaysInput])

  function openReview(row: AdminLeaveRequest) {
    setReviewingId(row.id)
    setReviewStatus('approved')
    setReviewNote('')
    setReviewContext(null)
    setContextLoading(true)
    void getLeaveReviewContext(row.id)
      .then((ctx) => {
        setReviewContext(ctx)
        if (ctx.leave.leaveType === 'unpaid') {
          setCalculationType('non_payable')
        } else {
          setCalculationType(
            ctx.defaultCalculationType === 'monthly_salary' ? 'monthly_salary' : 'hourly_salary'
          )
        }
        setPayableDaysInput(String(ctx.suggestedPayableDays))
      })
      .catch(() => {
        setNotice('Could not load review details.')
        setReviewingId(null)
      })
      .finally(() => setContextLoading(false))
  }

  async function submitReview() {
    if (!reviewingId) return
    setSaving(true)
    try {
      if (reviewStatus === 'rejected') {
        await reviewAdminLeaveRequest(reviewingId, {
          status: 'rejected',
          reviewedNote: reviewNote.trim() || undefined,
        })
      } else {
        if (!reviewContext) {
          setNotice('Missing review context.')
          setSaving(false)
          return
        }
        const pd = parseFloat(payableDaysInput)
        if (reviewContext.leave.leaveType === 'paid') {
          if (!Number.isFinite(pd) || pd < 0 || pd > 366) {
            setNotice('Payable days must be between 0 and 366.')
            setSaving(false)
            return
          }
          await reviewAdminLeaveRequest(reviewingId, {
            status: 'approved',
            reviewedNote: reviewNote.trim() || undefined,
            calculationType,
            payableDays: pd,
          })
        } else {
          await reviewAdminLeaveRequest(reviewingId, {
            status: 'approved',
            reviewedNote: reviewNote.trim() || undefined,
            payableDays: 0,
          })
        }
      }
      setNotice('Leave request updated.')
      setReviewingId(null)
      setReviewContext(null)
      await load(false)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Failed to update leave request.'
      setNotice(msg)
    } finally {
      setSaving(false)
    }
  }

  const isPaidLeave = reviewContext?.leave.leaveType === 'paid'

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
                className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80"
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
                  {r.status === 'approved' &&
                  r.leavePayableAmount != null &&
                  r.leavePayableAmount > 0 ? (
                    <p className="text-xs font-medium text-brand-700 mt-0.5 tabular-nums">
                      Approved leave pay: ${r.leavePayableAmount.toFixed(2)}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-surface-100 text-surface-600'}`}
                  >
                    {r.status}
                  </span>
                  {r.status === 'pending' && (
                    <button type="button" onClick={() => openReview(r)} className="btn-secondary rounded-xl px-3 py-2 text-xs">
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
            onClick={() => {
              setReviewingId(null)
              setReviewContext(null)
            }}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 shadow-xl">
            <h2 className="text-base font-semibold text-surface-900">Review leave request</h2>
            <p className="mt-1 text-sm text-surface-500">Approve or reject. Pay fields apply when approving.</p>

            {contextLoading || !reviewContext ? (
              <div className="py-10 text-center text-sm text-surface-500">Loading details…</div>
            ) : (
              <>
                <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50/80 p-3 text-sm space-y-1">
                  <p>
                    <span className="text-surface-500">Employee:</span>{' '}
                    <span className="font-medium text-surface-900">{reviewContext.leave.employeeName}</span>
                  </p>
                  <p>
                    <span className="text-surface-500">Period:</span>{' '}
                    <span className="tabular-nums">
                      {reviewContext.leave.startDate} → {reviewContext.leave.endDate}
                    </span>
                  </p>
                  <p>
                    <span className="text-surface-500">Type:</span>{' '}
                    {reviewContext.leave.leaveType === 'paid' ? 'Paid' : 'Unpaid'}
                  </p>
                  <p>
                    <span className="text-surface-500">Salary:</span>{' '}
                    {reviewContext.employee.salaryType} · base ${reviewContext.employee.baseSalary.toFixed(2)}
                  </p>
                  {reviewContext.leave.reason ? (
                    <p className="text-xs text-surface-600 pt-1 border-t border-surface-200/80">{reviewContext.leave.reason}</p>
                  ) : null}
                </div>

                <div className="mt-4 space-y-3">
                  <AdminSelect
                    value={reviewStatus}
                    onChange={(val) => setReviewStatus(val as 'approved' | 'rejected')}
                    options={[
                      { value: 'approved', label: 'Approve' },
                      { value: 'rejected', label: 'Reject' },
                    ]}
                  />

                  {reviewStatus === 'approved' && (
                    <>
                      {isPaidLeave ? (
                        <>
                          <div>
                            <label className="label">Calculation</label>
                            <AdminSelect
                              value={calculationType}
                              onChange={(val) => setCalculationType(val as LeaveCalcType)}
                              options={[
                                { value: 'non_payable', label: 'Non-payable' },
                                { value: 'hourly_salary', label: 'Hourly salary' },
                                { value: 'monthly_salary', label: 'Monthly salary' },
                              ]}
                            />
                          </div>
                          <div>
                            <label className="label">Payable days</label>
                            <input
                              type="number"
                              min={0}
                              max={366}
                              step={0.5}
                              value={payableDaysInput}
                              onChange={(e) => setPayableDaysInput(e.target.value)}
                              className="input w-full rounded-xl"
                            />
                            <p className="text-[10px] text-surface-500 mt-1">
                              Suggested (calendar span): {reviewContext.suggestedPayableDays}
                            </p>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-surface-600 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2">
                          Unpaid leave — stored pay amount will be $0.
                        </p>
                      )}

                      {preview && (isPaidLeave || reviewContext.leave.leaveType === 'unpaid') ? (
                        <div className="rounded-xl border border-surface-200 p-3 space-y-2 text-sm">
                          <p className="text-xs font-semibold text-surface-700 uppercase tracking-wide">Pay preview (locked)</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <span className="text-surface-500">Hourly rate</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.hourlyRate.toFixed(4)}
                            </span>
                            <span className="text-surface-500">Daily hours</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />
                              {preview.dailyHours}
                            </span>
                            <span className="text-surface-500">Daily salary</span>
                            <span className="tabular-nums text-right flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.dailySalary.toFixed(2)}
                            </span>
                            <span className="text-surface-500 font-medium">Payable amount</span>
                            <span className="tabular-nums text-right font-semibold text-surface-900 flex items-center justify-end gap-1">
                              <Lock className="w-3 h-3 text-surface-400" />${preview.payableAmount.toFixed(2)}
                            </span>
                          </div>
                          <p className="text-[10px] text-surface-500">Payable amount = daily salary × payable days (computed on save).</p>
                        </div>
                      ) : null}
                    </>
                  )}

                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    className="input w-full rounded-xl"
                    placeholder="Optional note"
                  />
                </div>
              </>
            )}

            <div className="mt-5 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReviewingId(null)
                  setReviewContext(null)
                }}
                className="btn-secondary rounded-xl px-4 py-2"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitReview()}
                className="btn-primary rounded-xl px-4 py-2"
                disabled={saving || contextLoading || !reviewContext}
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
