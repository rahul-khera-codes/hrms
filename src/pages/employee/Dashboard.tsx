import { useState, useMemo, useCallback, useEffect } from 'react'
import { format, subDays, startOfDay } from 'date-fns'
import { Clock, Play, Square, TrendingUp, Moon, Zap, Calendar, FileDown, Eye, X, History, LayoutDashboard, LayoutGrid, Table2 } from 'lucide-react'
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
import AdminDatePicker from '@/components/AdminDatePicker'
import { PageHeader } from '@/components/PageHeader'

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

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 p-5 sm:p-7 shadow-lg shadow-brand-500/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 sm:gap-6">
          <div className="min-w-0">
            <p className="text-brand-100 text-[11px] sm:text-xs font-semibold uppercase tracking-wider">{currentDate}</p>
            <p className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mt-1.5 font-mono tabular-nums tracking-tight">
              {currentTime}
            </p>
            <p className="mt-3 flex items-center gap-2">
              {clockedIn ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/30 ring-1 ring-emerald-300/50 backdrop-blur-sm px-2.5 py-1 text-xs font-semibold text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    Clocked in
                  </span>
                </>
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
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-brand-700 hover:bg-brand-50 font-semibold px-6 py-3.5 shadow-lg transition-all active:scale-[0.98] w-full sm:w-auto min-h-[3rem] disabled:opacity-70"
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

      {summary && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-3.5 h-3.5 text-surface-500 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-surface-500">{summary.period}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="stat-card flex items-center gap-3 hover:shadow-card-hover transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-surface-100 border border-surface-200 text-surface-600 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="stat-label truncate">Regular</p>
                <p className="stat-value truncate">{regularDuration}</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3 hover:shadow-card-hover transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="stat-label truncate">Overtime</p>
                <p className="stat-value truncate">{overtimeDuration}</p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3 hover:shadow-card-hover transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <Moon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="stat-label truncate">Night</p>
                <p className="stat-value truncate">{nightDuration}</p>
              </div>
            </div>
            <div className="stat-card bg-brand-50/40 border-brand-200/70 flex items-center gap-3 hover:shadow-card-hover transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="stat-label truncate text-brand-700">Total</p>
                <p className="stat-value truncate">{totalDuration}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                <FileDown className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-surface-900">Pay slip</h3>
                <p className="text-[11px] text-surface-500 mt-0.5">Preview or download your payroll slip for any period</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:items-end">
              <div className="flex-1 min-w-0 sm:max-w-[200px]">
                <label className="label">From</label>
                <AdminDatePicker value={slipFrom} onChange={(v) => setSlipFrom(v)} />
              </div>
              <div className="flex-1 min-w-0 sm:max-w-[200px]">
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
              <div className="rounded-xl border border-surface-200 bg-surface-50 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-surface-200 bg-white">
                  <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider">Preview</p>
                  <button
                    type="button"
                    onClick={() => setSlipPreviewUrl(null)}
                    className="btn-icon text-surface-500 hover:text-surface-900 hover:bg-surface-100"
                    aria-label="Close preview"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <iframe
                  title="Payroll slip preview"
                  src={slipPreviewUrl}
                  className="w-full min-h-[20rem] h-[min(70vh,40rem)] bg-white"
                />
              </div>
            )}
            {slipError && (
              <div className="alert-error"><span>{slipError}</span></div>
            )}

            <div className="pt-4 border-t border-surface-100">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-3.5 h-3.5 text-surface-500 shrink-0" />
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-surface-700">Saved payslips</h4>
              </div>
              {savedSlipsLoading ? (
                <div className="flex items-center gap-2 text-xs text-surface-500">
                  <span className="spinner w-4 h-4" />
                  Loading…
                </div>
              ) : savedSlips.length === 0 ? (
                <p className="text-xs text-surface-500">No saved payslips yet — download a PDF above to save one.</p>
              ) : (
                <ul className="space-y-2">
                  {savedSlips.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-surface-200/70 bg-surface-50/50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-surface-900 tabular-nums">
                          {s.periodFrom} → {s.periodTo}
                        </p>
                        <p className="text-[11px] text-surface-500 mt-0.5">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="card min-w-0">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-surface-900">Hours breakdown</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">This period by type</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="p-4">
          {pieData.length > 0 ? (
            <div className="space-y-4">
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
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#14b8a6' }} />
                  <span className="text-xs sm:text-sm text-surface-700 font-medium">Regular</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#f59e0b' }} />
                  <span className="text-xs sm:text-sm text-surface-700 font-medium">Overtime</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: '#6366f1' }} />
                  <span className="text-xs sm:text-sm text-surface-700 font-medium">Night</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-52 sm:h-64 flex items-center justify-center text-surface-400 text-xs sm:text-sm">
              No hours this period
            </div>
          )}
          </div>
        </div>

        <div className="card min-w-0">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-surface-900">Hours this week</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Daily breakdown</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="p-4 h-52 sm:h-64 min-h-[12rem]">
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

      <div className="card overflow-hidden min-w-0">
        <div className="card-header">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-surface-900">Recent sessions</h2>
              <p className="text-[11px] text-surface-500 mt-0.5">Your latest clock-in activity</p>
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
                className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white ring-1 ring-surface-200/70 hover:ring-brand-200/80 hover:bg-brand-50/20 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-100 flex items-center justify-center text-surface-500 shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900">{format(new Date(s.clockIn), 'MMM d, yyyy')}</p>
                  <p className="text-[11px] text-surface-500 mt-0.5 tabular-nums">
                    {format(new Date(s.clockIn), 'HH:mm:ss')} – {s.clockOut ? format(new Date(s.clockOut), 'HH:mm:ss') : '—'}
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
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock In</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock Out</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 5).map((s) => (
                  <tr key={s.id} className="border-b border-surface-100 hover:bg-brand-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap">
                      {format(new Date(s.clockIn), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                      {format(new Date(s.clockIn), 'HH:mm:ss')}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap">
                      {s.clockOut ? format(new Date(s.clockOut), 'HH:mm:ss') : '—'}
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
