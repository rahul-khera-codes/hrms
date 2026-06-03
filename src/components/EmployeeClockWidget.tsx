import { useEffect, useState, useCallback } from 'react'
import { format, addDays } from 'date-fns'
// 03JUN2026 — universal AST 12-hour formatting for the clock widget
import { fmtTime as fmtTimeAST, fmtTimeWithSeconds } from '@/lib/timeFormat'
import { Briefcase, Play, Square, CalendarDays } from 'lucide-react'
import {
  getActiveSession,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
} from '@/lib/apiSessions'
import type { ClockSession, AttendanceRecord } from '@/types'
import { getMyAttendance, getMySchedule } from '@/lib/apiEmployee'
import type { MyScheduleEntry } from '@/lib/apiEmployee'

/**
 * Clock-in / clock-out card + Today's Shift card.
 * Per 18MAY2026 client video: this widget lives at the top of My Attendance.
 * (Previously was on a separate Dashboard tab; that tab has been removed.)
 */
export function EmployeeClockWidget({ onChange }: { onChange?: () => void }) {
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [todaySchedule, setTodaySchedule] = useState<MyScheduleEntry | null>(null)
  const [upcomingShifts, setUpcomingShifts] = useState<MyScheduleEntry[]>([])
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null)
  const [now, setNow] = useState(() => new Date())

  const reload = useCallback(async () => {
    const today = format(new Date(), 'yyyy-MM-dd')
    // Next 5 days starting tomorrow — per 18MAY2026 client video request
    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd')
    const fiveDaysOut = format(addDays(new Date(), 5), 'yyyy-MM-dd')
    try {
      const [active, todaySched, nextFive, attendance] = await Promise.all([
        getActiveSession().catch(() => null),
        getMySchedule({ from: today, to: today }).catch(() => [] as MyScheduleEntry[]),
        getMySchedule({ from: tomorrow, to: fiveDaysOut }).catch(() => [] as MyScheduleEntry[]),
        getMyAttendance({ from: today, to: today }).catch(() => [] as AttendanceRecord[]),
      ])
      setActiveSession(active)
      setTodaySchedule(todaySched[0] ?? null)
      setUpcomingShifts(nextFive)
      setTodayAttendance(attendance[0] ?? null)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const clockedIn = activeSession != null
  const currentTime = clockedIn ? fmtTimeWithSeconds(now) : fmtTimeAST(now)
  const currentDate = format(now, 'EEEE, MMMM d')

  function fmtTime(isoStr: string | null | undefined): string {
    return fmtTimeAST(isoStr) || '--:--'
  }

  async function handleClockIn() {
    setActionLoading(true)
    try {
      await apiClockIn()
      await reload()
      onChange?.()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleClockOut() {
    setActionLoading(true)
    try {
      await apiClockOut()
      await reload()
      onChange?.()
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-4 sm:mb-5">
      {/* Today's Shift card */}
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs font-bold text-violet-700">
                    {todaySchedule.shiftName}
                  </span>
                </div>
                <p className="text-sm text-surface-600 dark:text-surface-300 font-medium">{todaySchedule.clientName}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2.5 px-3 text-center">
                  <p className="label">Shift Start</p>
                  <p className="text-lg font-bold tabular-nums text-surface-800 dark:text-surface-100 mt-0.5">{todaySchedule.startTime || '--:--'}</p>
                </div>
                <div className="rounded-lg bg-surface-50 dark:bg-surface-900 border border-surface-100 dark:border-surface-800 py-2.5 px-3 text-center">
                  <p className="label">Shift End</p>
                  <p className="text-lg font-bold tabular-nums text-surface-800 dark:text-surface-100 mt-0.5">{todaySchedule.endTime || '--:--'}</p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                  <p className="label text-blue-400">Clock In</p>
                  <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                    {todayAttendance ? fmtTime(todayAttendance.clockIn) : (clockedIn && activeSession ? fmtTime(activeSession.clockIn) : '--:--')}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                  <p className="label text-blue-400">Clock Out</p>
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
                    <p className="label text-blue-400">Clock In</p>
                    <p className="text-lg font-bold tabular-nums text-blue-700 mt-0.5">
                      {todayAttendance ? fmtTime(todayAttendance.clockIn) : (clockedIn && activeSession ? fmtTime(activeSession.clockIn) : '--:--')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-100 py-2.5 px-3 text-center">
                    <p className="label text-blue-400">Clock Out</p>
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

      {/* Clock In/Out card */}
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

      {/* Upcoming shifts (next 5 days) — per 18MAY2026 client video.
          22MAY2026: render unconditionally so the section is always visible.
          When there are no upcoming published shifts, show an empty state so
          the user knows the widget exists rather than wondering where it went. */}
      <div className="lg:col-span-2 card overflow-hidden">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Upcoming shifts</h3>
              <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Next 5 days</p>
            </div>
          </div>
        </div>
        {upcomingShifts.length > 0 ? (
          <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {upcomingShifts.slice(0, 5).map((s) => (
              <div key={s.id} className="rounded-lg border border-surface-200/80 bg-surface-50/40 dark:bg-surface-900 p-3">
                <p className="text-[10px] font-semibold text-surface-500 dark:text-surface-400 dark:text-surface-500 uppercase tracking-wider">
                  {s.date ? format(new Date(s.date + 'T00:00:00'), 'EEE MMM d') : '—'}
                </p>
                <p className="text-xs font-semibold text-violet-700 mt-1">{s.shiftName}</p>
                <p className="text-[11px] text-surface-600 dark:text-surface-300 mt-0.5">{s.startTime} – {s.endTime}</p>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 truncate mt-0.5">{s.clientName}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-sm text-surface-500 dark:text-surface-400 dark:text-surface-500">No published shifts in the next 5 days.</p>
            <p className="text-[11px] text-surface-400 dark:text-surface-500 mt-1">Your supervisor will publish your schedule from the Scheduler module.</p>
          </div>
        )}
      </div>
    </div>
  )
}
