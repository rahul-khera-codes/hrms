import { useState, useMemo } from 'react'
import { format, subDays } from 'date-fns'
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
import { mockSessions, mockPayrollSummary } from '@/data/mock'

// Mock weekly hours for bar chart (last 7 days)
const getWeeklyHoursData = () => {
  return [6, 5, 4, 3, 2, 1, 0].map((daysAgo) => {
    const d = subDays(new Date(), daysAgo)
    const dayHours = daysAgo === 0 ? 4.5 : daysAgo === 1 ? 8 : daysAgo === 2 ? 9 : 8
    return {
      day: format(d, 'EEE'),
      fullDate: format(d, 'MMM d'),
      hours: dayHours,
      regular: Math.min(dayHours, 8),
      overtime: Math.max(0, dayHours - 8),
    }
  }).reverse()
}

const HOURS_COLORS = {
  regular: '#14b8a6',
  overtime: '#f59e0b',
  night: '#6366f1',
}

export default function EmployeeDashboard() {
  const [clockedIn, setClockedIn] = useState(
    () => mockSessions.some((s) => s.status === 'active')
  )
  const currentTime = format(new Date(), 'HH:mm')
  const currentDate = format(new Date(), 'EEEE, MMMM d')

  const weeklyData = useMemo(() => getWeeklyHoursData(), [])

  const pieData = useMemo(
    () => [
      {
        name: 'Regular',
        value: mockPayrollSummary.regularHours,
        color: HOURS_COLORS.regular,
      },
      {
        name: 'Overtime',
        value: mockPayrollSummary.overtimeHours,
        color: HOURS_COLORS.overtime,
      },
      ...(mockPayrollSummary.nightHours > 0
        ? [{ name: 'Night', value: mockPayrollSummary.nightHours, color: HOURS_COLORS.night }]
        : []),
    ].filter((d) => d.value > 0),
    []
  )

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Dashboard</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">Track your time and view your hours.</p>
        </div>
      </div>

      {/* Clock card */}
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
                onClick={() => setClockedIn(false)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-medium px-4 py-3 sm:px-6 sm:py-3.5 backdrop-blur-sm transition-colors w-full sm:w-auto min-h-[2.75rem]"
              >
                <Square className="w-5 h-5 shrink-0" />
                Clock out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setClockedIn(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-700 hover:bg-brand-50 font-medium px-4 py-3 sm:px-6 sm:py-3.5 shadow-sm transition-colors w-full sm:w-auto min-h-[2.75rem]"
              >
                <Play className="w-5 h-5 shrink-0" />
                Clock in
              </button>
            )}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
      </div>

      {/* Summary cards */}
      <div>
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <Calendar className="w-4 h-4 text-surface-500 shrink-0" />
          <span className="text-xs sm:text-sm text-surface-500 truncate">{mockPayrollSummary.period}</span>
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
                  {mockPayrollSummary.regularHours}h
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
                  {mockPayrollSummary.overtimeHours}h
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
                  {mockPayrollSummary.nightHours}h
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
                  {mockPayrollSummary.totalHours}h
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Hours breakdown - Pie */}
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Hours breakdown</h2>
          <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-6">This period by type</p>
          {pieData.length > 0 ? (
            <div className="h-52 sm:h-64 min-h-[12rem]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, value }) => `${name} ${value}h`}
                    labelLine={false}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value}h`, 'Hours']}
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

        {/* Weekly hours - Bar */}
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
                  tickFormatter={(v) => `${v}h`}
                  width={24}
                />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  formatter={(value: number) => [`${value}h`, 'Hours']}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate}
                />
                <Bar
                  dataKey="hours"
                  fill="#14b8a6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  name="Hours"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent sessions */}
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
                {mockSessions.slice(0, 5).map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors"
                  >
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-medium text-surface-900 whitespace-nowrap">
                      {format(new Date(s.clockIn), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 font-mono tabular-nums">
                      {format(new Date(s.clockIn), 'HH:mm')}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 font-mono tabular-nums">
                      {s.clockOut ? format(new Date(s.clockOut), 'HH:mm') : '—'}
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
        </div>
      </div>
    </div>
  )
}
