import { useState, useMemo, useCallback, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import { Clock, Play, Square, Calendar, FileDown, Eye, X, History, LayoutDashboard, LayoutGrid, Table2, Briefcase, BarChart3, Timer } from 'lucide-react'
import type { ClockSession, PayrollSummary, AttendanceRecord } from '@/types'
import {
  getActiveSession,
  getSessions,
  getSummary,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  downloadMyPayrollSlipPdf,
  fetchMyPayrollSlipPdfBlob,
  listMyPayrollSlips,
  downloadStoredPayslipPdf,
} from '@/lib/apiSessions'
import { getMyAttendance, getMySchedule } from '@/lib/apiEmployee'
import type { MyScheduleEntry } from '@/lib/apiEmployee'
import { getPayrollPeriods } from '@/lib/apiAdmin'
import type { PayrollPeriod } from '@/lib/apiAdmin'
import AdminDatePicker from '@/components/AdminDatePicker'
import { PageHeader } from '@/components/PageHeader'

function fmtHours(v: number | null | undefined): string {
  if (v == null || v === 0) return '0.00'
  return v.toFixed(2)
}

/* ------------------------------------------------------------------ */
/*  Payable hours bar chart (pure CSS)                                */
/* ------------------------------------------------------------------ */
function HoursChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2.5">
      {data.map(d => (
        <div key={d.label} className="flex items-center gap-2.5">
          <span className="text-[11px] font-semibold text-surface-600 dark:text-surface-300 w-[4.5rem] shrink-0 text-right">{d.label}</span>
          <div className="flex-1 bg-surface-100 dark:bg-surface-800 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${d.color}`}
              style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? '4px' : '0' }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums w-12 text-right text-surface-700 dark:text-surface-200">{d.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Find the current payroll period (today falls within periodFrom..periodTo). */
function findCurrentPeriod(periods: PayrollPeriod[]): PayrollPeriod | undefined {
  const today = format(new Date(), 'yyyy-MM-dd')
  return periods.find(p => p.periodFrom <= today && p.periodTo >= today)
}

/** Aggregate attendance records into payable-hours buckets. */
function aggregatePayableHours(records: AttendanceRecord[]) {
  let pReg = 0
  let pN15 = 0
  let pX35 = 0
  let pX100 = 0
  let pHdy = 0
  let pDnp = 0
  let pRvw = 0
  for (const r of records) {
    pReg += r.regHours ?? 0
    pN15 += r.n15Hours ?? 0
    pX35 += r.x35Hours ?? 0
    pX100 += r.x100Hours ?? 0
    pHdy += r.hdyHours ?? 0
    pDnp += r.payType === 'DNP' ? Math.max(0, (r.actualHours ?? 0) - (r.adbtHours ?? 0)) : 0
    pRvw += r.payableRvwHours ?? 0
  }
  return { pReg, pN15, pX35, pX100, pHdy, pDnp, pRvw }
}

// 03JUN2026 — universal AST 12-hour formatting via the shared helper.
import { fmtTime as fmtTimeAST, fmtTimeWithSeconds } from '@/lib/timeFormat'
function fmtTime(isoStr: string | null | undefined): string {
  return fmtTimeAST(isoStr) || '--:--'
}

export default function EmployeeDashboard() {
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null)
  const [sessions, setSessions] = useState<ClockSession[]>([])
  const [_summary, setSummary] = useState<PayrollSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [slipFrom, setSlipFrom] = useState(() => format(subDays(new Date(), 14), 'yyyy-MM-dd'))
  const [slipTo, setSlipTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [slipLoading, setSlipLoading] = useState(false)
  const [slipError, setSlipError] = useState<string | null>(null)
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null)
  const [slipPreviewLoading, setSlipPreviewLoading] = useState(false)
  const [savedSlips, setSavedSlips] = useState<
    { id: string; periodFrom: string; periodTo: string; savedAt: string }[]
  >([])
  const [savedSlipsLoading, setSavedSlipsLoading] = useState(false)
  const [sessionsView, setSessionsView] = useState<'card' | 'table'>('table')

  // New state for shift info, payroll period and attendance
  const [todaySchedule, setTodaySchedule] = useState<MyScheduleEntry | null>(null)
  // Per 19MAY2026 Scheduler video: pre-population of next 2 weeks of published shifts.
  const [upcomingShifts, setUpcomingShifts] = useState<MyScheduleEntry[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<PayrollPeriod | null>(null)
  const [cycleAttendance, setCycleAttendance] = useState<AttendanceRecord[]>([])
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [active, list, sum] = await Promise.all([
        getActiveSession(),
        getSessions({ limit: 20 }),
        getSummary(),
      ])
      setActiveSession(active)
      setSessions(list)
      setSummary(sum)
    } catch {
      setSessions([])
      setSummary(null)
      setActiveSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch today's schedule and current payroll cycle attendance
  const fetchEnhancedData = useCallback(async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const twoWeeksOut = format(new Date(Date.now() + 13 * 86_400_000), 'yyyy-MM-dd')
    try {
      // Fetch today + next-2-weeks schedule and payroll periods in parallel.
      const [scheduleEntries, upcoming, periods] = await Promise.all([
        getMySchedule({ from: today, to: today }).catch(() => [] as MyScheduleEntry[]),
        getMySchedule({ from: today, to: twoWeeksOut }).catch(() => [] as MyScheduleEntry[]),
        getPayrollPeriods().catch(() => [] as PayrollPeriod[]),
      ])

      // Today's schedule
      if (scheduleEntries.length > 0) {
        setTodaySchedule(scheduleEntries[0])
      }
      // Drop today and rely on date-then-start ordering from the API.
      setUpcomingShifts(upcoming.filter((e) => e.date && e.date > today))

      // Current payroll period
      const period = findCurrentPeriod(periods)
      if (period) {
        setCurrentPeriod(period)

        // Fetch attendance for the current cycle
        const attendance = await getMyAttendance({ from: period.periodFrom, to: period.periodTo }).catch(() => [] as AttendanceRecord[])
        setCycleAttendance(attendance)

        // Today's attendance record
        const todayRec = attendance.find(r => r.date === today)
        if (todayRec) setTodayAttendance(todayRec)
      } else {
        // Fallback: just load today's attendance
        const attendance = await getMyAttendance({ from: today, to: today }).catch(() => [] as AttendanceRecord[])
        if (attendance.length > 0) setTodayAttendance(attendance[0])
      }
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchEnhancedData()
  }, [fetchData, fetchEnhancedData])

  const reloadSavedSlips = useCallback(async () => {
    setSavedSlipsLoading(true)
    try {
      const list = await listMyPayrollSlips()
      setSavedSlips(list)
    } catch {
      setSavedSlips([])
    } finally {
      setSavedSlipsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    void reloadSavedSlips()
  }, [loading, reloadSavedSlips])

  useEffect(() => {
    return () => {
      if (slipPreviewUrl) URL.revokeObjectURL(slipPreviewUrl)
    }
  }, [slipPreviewUrl])

  useEffect(() => {
    setSlipPreviewUrl(null)
  }, [slipFrom, slipTo])

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const clockedIn = activeSession != null
  const currentTime = clockedIn ? fmtTimeWithSeconds(now) : fmtTimeAST(now)
  const currentDate = format(now, 'EEEE, MMMM d')

  // Aggregate payable hours for the cycle
  const payable = useMemo(() => aggregatePayableHours(cycleAttendance), [cycleAttendance])
  const totalPayable = payable.pReg + payable.pN15 + payable.pX35 + payable.pX100 + payable.pHdy + payable.pRvw

  // Chart data for the bar chart
  const chartData = useMemo(() => [
    { label: 'P-REG', value: payable.pReg, color: 'bg-blue-500' },
    { label: 'P-N15%', value: payable.pN15, color: 'bg-violet-500' },
    { label: 'P-X35%', value: payable.pX35, color: 'bg-amber-500' },
    { label: 'P-X100%', value: payable.pX100, color: 'bg-red-500' },
    { label: 'P-HDY', value: payable.pHdy, color: 'bg-emerald-500' },
    { label: 'P-RVW', value: payable.pRvw, color: 'bg-rose-400' },
  ], [payable])

  async function handleClockIn() {
    setActionLoading(true)
    try {
      await apiClockIn()
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleClockOut() {
    setActionLoading(true)
    try {
      await apiClockOut()
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePreviewPaySlip() {
    setSlipError(null)
    setSlipPreviewLoading(true)
    try {
      const blob = await fetchMyPayrollSlipPdfBlob({ from: slipFrom, to: slipTo })
      const url = URL.createObjectURL(blob)
      setSlipPreviewUrl(url)
    } catch (e: unknown) {
      setSlipError(e instanceof Error ? e.message : 'Failed to load pay slip preview')
    } finally {
      setSlipPreviewLoading(false)
    }
  }

  async function handleDownloadPaySlip() {
    setSlipError(null)
    setSlipLoading(true)
    try {
      await downloadMyPayrollSlipPdf({ from: slipFrom, to: slipTo })
      await reloadSavedSlips()
    } catch (e: unknown) {
      setSlipError(e instanceof Error ? e.message : 'Failed to download pay slip')
    } finally {
      setSlipLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="Dashboard"
        subtitle="Track your time and view your hours."
        icon={<LayoutDashboard className="w-5 h-5" />}
      />

      {/* ============================================================ */}
      {/* TOP SECTION: Today's Shift Info + Clock In/Out (side by side) */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">

        {/* Today's Shift Info Card */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center shrink-0">
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Today's Shift</h3>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">{format(new Date(), 'EEEE, MMM d, yyyy')}</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            {todaySchedule ? (
              <div className="space-y-3">
                {/* Shift name + Account */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs font-bold text-violet-700">
                      {todaySchedule.shiftName}
                    </span>
                  </div>
                  <p className="text-sm text-surface-600 dark:text-surface-300 font-medium">{todaySchedule.clientName}</p>
                </div>

                {/* Time grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2.5 px-3 text-center">
                    <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">Shift Start</p>
                    <p className="text-lg font-bold tabular-nums text-surface-800 dark:text-surface-100 mt-0.5">{todaySchedule.startTime || '--:--'}</p>
                  </div>
                  <div className="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2.5 px-3 text-center">
                    <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider">Shift End</p>
                    <p className="text-lg font-bold tabular-nums text-surface-800 dark:text-surface-100 mt-0.5">{todaySchedule.endTime || '--:--'}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Clock In</p>
                    <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                      {todayAttendance ? fmtTime(todayAttendance.clockIn) : (clockedIn && activeSession ? fmtTime(activeSession.clockIn) : '--:--')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Clock Out</p>
                    <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                      {todayAttendance ? fmtTime(todayAttendance.clockOut) : '--:--'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="w-10 h-10 rounded-full bg-surface-100 dark:bg-surface-800 flex items-center justify-center mx-auto mb-2">
                  <Briefcase className="w-4 h-4 text-surface-400 dark:text-surface-500" />
                </div>
                <p className="text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">No shift scheduled for today</p>
                {(clockedIn || todayAttendance) && (
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Clock In</p>
                      <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                        {todayAttendance ? fmtTime(todayAttendance.clockIn) : (clockedIn && activeSession ? fmtTime(activeSession.clockIn) : '--:--')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                      <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Clock Out</p>
                      <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                        {todayAttendance ? fmtTime(todayAttendance.clockOut) : '--:--'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Clock In/Out Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 sm:p-7 shadow-lg shadow-brand-500/20">
          <div className="relative z-10 flex flex-col justify-between h-full gap-4 sm:gap-6">
            <div className="min-w-0">
              <p className="text-brand-100 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">{currentDate}</p>
              <p className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mt-1.5 font-mono tabular-nums tracking-tight">
                {currentTime}
              </p>
              <p className="mt-3 flex items-center gap-2">
                {clockedIn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/30 ring-1 ring-emerald-300/50 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Clocked in
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white/80">
                    Not clocked in
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0">
              {clockedIn ? (
                <button
                  type="button"
                  onClick={handleClockOut}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-semibold px-6 py-3.5 backdrop-blur-sm border border-white/20 transition-all active:scale-[0.98] w-full sm:w-auto min-h-[3rem] disabled:opacity-70 shadow-lg"
                >
                  {actionLoading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Square className="w-5 h-5 shrink-0" />
                  )}
                  Clock out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClockIn}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-surface-900 text-brand-700 hover:bg-brand-50 font-semibold px-6 py-3.5 shadow-lg transition-all active:scale-[0.98] w-full sm:w-auto min-h-[3rem] disabled:opacity-70"
                >
                  {actionLoading ? (
                    <span className="w-5 h-5 border-2 border-brand-700 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 shrink-0" />
                  )}
                  Clock in
                </button>
              )}
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        </div>
      </div>

      {/* ============================================================ */}
      {/* UPCOMING SHIFTS — next 2 weeks of published, pre-assigned    */}
      {/* shifts per 19MAY2026 Scheduler video.                        */}
      {/* ============================================================ */}
      {upcomingShifts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Upcoming Shifts</h3>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Your next 2 weeks of pre-assigned shifts.</p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-surface-100 dark:divide-surface-800">
            {upcomingShifts.slice(0, 14).map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 text-brand-700 flex flex-col items-center justify-center shrink-0">
                  <span className="text-[9px] font-semibold uppercase tracking-wide leading-none">
                    {s.date ? format(new Date(s.date), 'MMM') : '—'}
                  </span>
                  <span className="text-sm font-bold tabular-nums leading-tight">
                    {s.date ? format(new Date(s.date), 'd') : '—'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 truncate">{s.shiftName}</p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 truncate">{s.clientName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono tabular-nums text-surface-800 dark:text-surface-100">{String(s.startTime).slice(0, 5)}–{String(s.endTime).slice(0, 5)}</p>
                  <p className="text-[10px] text-surface-400 dark:text-surface-500">{s.date ? format(new Date(s.date), 'EEE') : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ============================================================ */}
      {/* MIDDLE SECTION: Payable hours stat cards for current cycle   */}
      {/* ============================================================ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="w-3.5 h-3.5 text-surface-500 dark:text-surface-400 dark:text-surface-500 shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500 dark:text-surface-400 dark:text-surface-500">
            {currentPeriod
              ? `Cycle ${currentPeriod.cycleCode}  |  ${currentPeriod.periodFrom} to ${currentPeriod.periodTo}`
              : 'Current cycle'}
          </span>
        </div>

        {/* Total payable hours counter */}
        <div className="mb-4 rounded-xl border border-brand-200/70 bg-brand-50/40 p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Total payable hours this cycle</p>
            <p className="text-2xl font-bold tabular-nums text-surface-900 dark:text-surface-50 mt-0.5">{totalPayable.toFixed(2)}<span className="text-sm font-medium text-surface-500 dark:text-surface-400 dark:text-surface-500 ml-1">hrs</span></p>
          </div>
        </div>

        {/* Payable hours stat cards */}
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
          {([
            { label: 'P-REG', val: payable.pReg, bgClass: 'bg-blue-50 border-blue-200', textClass: 'text-blue-700', labelClass: 'text-blue-500' },
            { label: 'P-N15%', val: payable.pN15, bgClass: 'bg-violet-50 border-violet-200', textClass: 'text-violet-700', labelClass: 'text-violet-500' },
            { label: 'P-X35%', val: payable.pX35, bgClass: 'bg-amber-50 border-amber-200', textClass: 'text-amber-700', labelClass: 'text-amber-500' },
            { label: 'P-X100%', val: payable.pX100, bgClass: 'bg-red-50 border-red-200', textClass: 'text-red-700', labelClass: 'text-red-500' },
            { label: 'P-HDY', val: payable.pHdy, bgClass: 'bg-emerald-50 border-emerald-200', textClass: 'text-emerald-700', labelClass: 'text-emerald-500' },
            { label: 'P-DNP', val: payable.pDnp, bgClass: 'bg-surface-50 dark:bg-surface-900 border-surface-200 dark:border-surface-700', textClass: 'text-surface-700 dark:text-surface-200', labelClass: 'text-surface-400 dark:text-surface-500' },
            { label: 'P-RVW', val: payable.pRvw, bgClass: 'bg-rose-50 border-rose-200', textClass: 'text-rose-700', labelClass: 'text-rose-500' },
          ] as const).map((item) => {
            const isNonZero = item.val > 0
            return (
              <div
                key={item.label}
                className={`text-center rounded-xl border py-3 px-2 transition-shadow hover:shadow-sm ${isNonZero ? item.bgClass : 'bg-white dark:bg-surface-900 border-surface-100 dark:border-surface-800'}`}
              >
                <p className={`text-[10px] font-semibold uppercase tracking-wider ${isNonZero ? item.labelClass : 'text-surface-400 dark:text-surface-500'}`}>{item.label}</p>
                <p className={`text-lg font-bold tabular-nums mt-1 ${isNonZero ? item.textClass : 'text-surface-300'}`}>{fmtHours(item.val)}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* BOTTOM SECTION: Payable hours bar chart                      */}
      {/* ============================================================ */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Payable hours breakdown</h3>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                {currentPeriod ? `${currentPeriod.periodFrom} to ${currentPeriod.periodTo}` : 'Current cycle'}
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {chartData.some(d => d.value > 0) ? (
            <HoursChart data={chartData} />
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-surface-400 dark:text-surface-500">
              <BarChart3 className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No payable hours recorded yet this cycle</p>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* PAY SLIP SECTION                                             */}
      {/* ============================================================ */}
      {!loading && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <FileDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Pay slip</h3>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Preview or download your payroll slip for any period</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
              <div className="flex-1 min-w-[170px] sm:max-w-[220px]">
                <label className="label">From</label>
                <AdminDatePicker value={slipFrom} onChange={(v) => setSlipFrom(v)} />
              </div>
              <div className="flex-1 min-w-[170px] sm:max-w-[220px]">
                <label className="label">To</label>
                <AdminDatePicker value={slipTo} onChange={(v) => setSlipTo(v)} />
              </div>
              <button
                type="button"
                onClick={handlePreviewPaySlip}
                disabled={slipPreviewLoading || slipFrom > slipTo}
                className="btn-secondary"
              >
                {slipPreviewLoading ? (
                  <span className="spinner w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4 shrink-0" />
                )}
                Preview
              </button>
              <button
                type="button"
                onClick={handleDownloadPaySlip}
                disabled={slipLoading || slipFrom > slipTo}
                className="btn-primary"
              >
                {slipLoading ? (
                  <span className="spinner w-4 h-4 border-white/30 border-t-white" />
                ) : (
                  <FileDown className="w-4 h-4 shrink-0" />
                )}
                Download PDF
              </button>
            </div>
            {slipPreviewUrl && (
              <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900">
                  <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">Preview</p>
                  <button
                    type="button"
                    onClick={() => setSlipPreviewUrl(null)}
                    className="btn-icon text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-900 dark:text-surface-50 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800"
                    aria-label="Close preview"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <iframe
                  title="Payroll slip preview"
                  src={slipPreviewUrl}
                  className="w-full min-h-[20rem] h-[min(70vh,40rem)] bg-white dark:bg-surface-900"
                />
              </div>
            )}
            {slipError && (
              <div className="alert-error"><span>{slipError}</span></div>
            )}

            <div className="pt-4 border-t border-surface-100 dark:border-surface-800">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-3.5 h-3.5 text-surface-500 dark:text-surface-400 dark:text-surface-500 shrink-0" />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-surface-700 dark:text-surface-200">Saved payslips</h4>
              </div>
              {savedSlipsLoading ? (
                <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">
                  <span className="spinner w-4 h-4" />
                  Loading...
                </div>
              ) : savedSlips.length === 0 ? (
                <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500">No saved payslips yet -- download a PDF above to save one.</p>
              ) : (
                <ul className="space-y-2">
                  {savedSlips.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-surface-200/70 bg-surface-50/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 tabular-nums">
                          {s.periodFrom} → {s.periodTo}
                        </p>
                        <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">
                          Saved {format(new Date(s.savedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { void downloadStoredPayslipPdf(s).catch(() => {}) }}
                        className="btn-secondary btn-sm shrink-0"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* RECENT SESSIONS                                              */}
      {/* ============================================================ */}
      <div className="card overflow-hidden min-w-0">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Recent sessions</h2>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Your latest clock-in activity</p>
            </div>
          </div>
          {sessions.length > 0 && (
            <div className="segmented">
              <button
                type="button"
                onClick={() => setSessionsView('card')}
                className={`segmented-item ${sessionsView === 'card' ? 'segmented-item-active' : ''}`}
                aria-label="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSessionsView('table')}
                className={`segmented-item ${sessionsView === 'table' ? 'segmented-item-active' : ''}`}
                aria-label="Table view"
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock className="w-5 h-5" /></div>
            <p className="empty-state-title">No recent sessions</p>
            <p className="empty-state-description">Your clock-in history will appear here.</p>
          </div>
        ) : sessionsView === 'card' ? (
          <ul className="p-3 sm:p-4 space-y-2">
            {sessions.slice(0, 5).map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white dark:bg-surface-900 ring-1 ring-surface-200/70 hover:ring-brand-200/80 hover:bg-brand-50/20 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-500 dark:text-surface-400 dark:text-surface-500 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-surface-50">{format(new Date(s.clockIn), 'MMM d, yyyy')}</p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5 tabular-nums">
                    {fmtTimeWithSeconds(s.clockIn)} – {s.clockOut ? fmtTimeWithSeconds(s.clockOut) : '--'}
                  </p>
                </div>
                <span className={`${s.status === 'active' ? 'badge-warning' : 'badge-neutral'} capitalize shrink-0`}>
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock In</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock Out</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="border-b border-surface-100 dark:border-surface-800 hover:bg-brand-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 dark:text-surface-50 whitespace-nowrap">
                      {format(new Date(s.clockIn), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                      {fmtTimeWithSeconds(s.clockIn)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 dark:text-surface-200 tabular-nums whitespace-nowrap">
                      {s.clockOut ? fmtTimeWithSeconds(s.clockOut) : '--'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`${s.status === 'active' ? 'badge-warning' : 'badge-neutral'} capitalize`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
