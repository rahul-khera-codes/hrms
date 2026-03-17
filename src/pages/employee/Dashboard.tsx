import { useState, useMemo, useCallback, useEffect } from 'react'
import { format, subDays, startOfDay } from 'date-fns'
import { Clock, Play, Square, TrendingUp, Moon, Zap, Calendar } from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'
import type { ClockSession, PayrollSummary } from '@/types'
import { getActiveSession, getSessions, getSummary, clockIn as apiClockIn, clockOut as apiClockOut } from '@/lib/apiSessions'

const HOURS_COLORS = {
  regular: '#14b8a6',
  overtime: '#f59e0b',
  night: '#6366f1',
}

function formatDuration(totalMinutes: number) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

function getSessionElapsedMinutes(session: ClockSession) {
  if (!session.clockOut) return 0
  const startMs = new Date(session.clockIn).getTime()
  const endMs = new Date(session.clockOut).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 0
  return (endMs - startMs) / 60000
}

function formatCompactDuration(totalMinutes: number) {
  return formatDuration(totalMinutes)
}

function formatWeeklyAxisTick(totalMinutes: number) {
  if (totalMinutes <= 0) return '0s'
  if (totalMinutes < 1) return `${Math.max(1, Math.round(totalMinutes * 60))}s`
  if (totalMinutes < 60) return `${Math.round(totalMinutes)}m`
  return `${(totalMinutes / 60).toFixed(1)}h`
}

function buildWeeklyData(sessions: ClockSession[]) {
  return [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => {
    const d = subDays(new Date(), daysAgo)
    const dayStr = format(startOfDay(d), 'yyyy-MM-dd')
    const daySessions = sessions.filter((s) => {
      const inDate = format(startOfDay(new Date(s.clockIn)), 'yyyy-MM-dd')
      return inDate === dayStr && s.clockOut
    })
    const totalMinutes = daySessions.reduce((acc, s) => acc + getSessionElapsedMinutes(s), 0)
    return {
      day: format(d, 'EEE'),
      fullDate: format(d, 'MMM d'),
      minutes: totalMinutes,
      hours: totalMinutes / 60,
      regular: Math.min(totalMinutes / 60, 8),
      overtime: Math.max(0, totalMinutes / 60 - 8),
    }
  }).reverse()
}

export default function EmployeeDashboard() {
  const [activeSession, setActiveSession] = useState<ClockSession | null>(null)
  const [sessions, setSessions] = useState<ClockSession[]>([])
  const [summary, setSummary] = useState<PayrollSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const clockedIn = activeSession != null
  const currentTime = format(now, clockedIn ? 'HH:mm:ss' : 'HH:mm')
  const currentDate = format(now, 'EEEE, MMMM d')

  const weeklyData = useMemo(() => buildWeeklyData(sessions), [sessions])

  const pieData = useMemo(() => {
    if (!summary) return []
    return [
      {
        name: 'Regular',
        value: summary.regularMinutes ?? (summary.regularHours ?? 0) * 60,
        color: HOURS_COLORS.regular,
      },
      {
        name: 'Overtime',
        value: summary.overtimeMinutes ?? (summary.overtimeHours ?? 0) * 60,
        color: HOURS_COLORS.overtime,
      },
      ...((summary.nightMinutes ?? (summary.nightHours ?? 0) * 60) > 0
        ? [{ name: 'Night', value: summary.nightMinutes ?? (summary.nightHours ?? 0) * 60, color: HOURS_COLORS.night }]
        : []),
    ].filter((d) => d.value > 0)
  }, [summary])

  const regularDuration = formatDuration(summary?.regularMinutes ?? summary?.regularHours ?? 0)
  const overtimeDuration = formatDuration(summary?.overtimeMinutes ?? summary?.overtimeHours ?? 0)
  const nightDuration = formatDuration(summary?.nightMinutes ?? summary?.nightHours ?? 0)
  const totalDuration = formatDuration(summary?.totalMinutes ?? summary?.totalHours ?? 0)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Dashboard</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Track your time and view your hours.</p>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-4 sm:p-6 lg:p-8 shadow-lg shadow-brand-500/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <p className="text-brand-100 text-xs sm:text-sm font-medium truncate">{currentDate}</p>
            <p className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-white mt-1 font-mono tabular-nums tracking-tight">
              {currentTime}
            </p>
            <p className="mt-2 sm:mt-3 flex items-center gap-2">
              {clockedIn ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-pulse shrink-0" />
                  <span className="text-brand-50 font-medium text-sm sm:text-base">You are clocked in</span>
                </>
              ) : (
                <span className="text-brand-200 text-sm sm:text-base">Not clocked in</span>
              )}
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 shrink-0 flex-shrink-0">
            {clockedIn ? (
              <button
                type="button"
                onClick={handleClockOut}
                disabled={actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-medium px-4 py-3 sm:px-6 sm:py-3.5 backdrop-blur-sm transition-colors w-full sm:w-auto min-h-[2.75rem] disabled:opacity-70"
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-700 hover:bg-brand-50 font-medium px-4 py-3 sm:px-6 sm:py-3.5 shadow-sm transition-colors w-full sm:w-auto min-h-[2.75rem] disabled:opacity-70"
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>

      {summary && (
        <div>
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Calendar className="w-4 h-4 text-surface-500 shrink-0" />
            <span className="text-xs sm:text-sm text-surface-500 truncate">{summary.period}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-surface-100 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-surface-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Regular</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 tabular-nums truncate">
                    {regularDuration}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Overtime</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 tabular-nums truncate">
                    {overtimeDuration}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <Moon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Night</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 tabular-nums truncate">
                    {nightDuration}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider truncate">Total</p>
                  <p className="text-lg sm:text-xl font-semibold text-surface-900 tabular-nums truncate">
                    {totalDuration}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Hours breakdown</h2>
          <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">This period by type</p>
          {pieData.length > 0 ? (
            <div className="h-52 sm:h-64 min-h-[12rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="60%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name} ${formatCompactDuration(Number(value) || 0)}`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatDuration(value), 'Duration']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-52 sm:h-64 flex items-center justify-center text-surface-400 text-xs sm:text-sm">
              No hours this period
            </div>
          )}
        </div>

        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Hours this week</h2>
          <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">Daily breakdown</p>
          <div className="h-52 sm:h-64 min-h-[12rem]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatWeeklyAxisTick(v)}
                  width={60}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(value: number) => [formatDuration(value), 'Duration']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate}
                />
                <Bar
                  dataKey="minutes"
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  name="Duration"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Recent sessions</h2>
        <p className="text-xs sm:text-sm text-surface-500 mb-3 sm:mb-4">Your latest clock-in activity</p>
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-left min-w-[420px]">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50/80">
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Clock in
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Clock out
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-medium text-surface-900 whitespace-nowrap">
                      {format(new Date(s.clockIn), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 font-mono tabular-nums">
                      {format(new Date(s.clockIn), 'HH:mm:ss')}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 font-mono tabular-nums">
                      {s.clockOut ? format(new Date(s.clockOut), 'HH:mm:ss') : '—'}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                      <span
                        className={
                          s.status === 'active'
                            ? 'inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-brand-100 text-brand-700'
                            : 'inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-surface-100 text-surface-600'
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sessions.length === 0 && (
            <div className="p-8 text-center text-surface-500 text-sm">
              No sessions yet. Clock in to start tracking.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
