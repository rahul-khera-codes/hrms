import { useState, useMemo, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import { getSessions } from '@/lib/apiSessions'
import type { ClockSession } from '@/types'
import { Clock, Calendar, TrendingUp, Zap } from 'lucide-react'

function formatDuration(totalMinutes: number) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':')
}

function getElapsedMinutes(session: ClockSession) {
  if (!session.clockOut) return null
  const startMs = new Date(session.clockIn).getTime()
  const endMs = new Date(session.clockOut).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null
  return (endMs - startMs) / 60000
}

function getDisplayRegularMinutes(session: ClockSession) {
  const elapsed = getElapsedMinutes(session)
  return elapsed ?? 0
}

export default function EmployeeSessions() {
  const [sessions, setSessions] = useState<ClockSession[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSessions = useCallback(async () => {
    try {
      const list = await getSessions({ limit: 100 })
      setSessions(list)
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const summary = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed')
    const regularMin = completed.reduce((acc, s) => acc + getDisplayRegularMinutes(s), 0)
    const overtimeMin = completed.reduce((acc, s) => acc + (s.overtimeMinutes ?? 0), 0)
    const nightMin = completed.reduce((acc, s) => acc + (s.nightMinutes ?? 0), 0)
    return {
      sessions: completed.length,
      regularDuration: formatDuration(regularMin),
      overtimeDuration: formatDuration(overtimeMin),
      nightDuration: formatDuration(nightMin),
      totalDuration: formatDuration(regularMin + overtimeMin + nightMin),
    }
  }, [sessions])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">My Sessions</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">View and manage your clock-in / clock-out history.</p>
      </div>

      {sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-surface-100 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-surface-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Sessions</p>
                <p className="text-base sm:text-lg font-semibold text-surface-900 tabular-nums truncate">{summary.sessions}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Regular</p>
                <p className="text-base sm:text-lg font-semibold text-surface-900 tabular-nums truncate">{summary.regularDuration}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">Overtime</p>
                <p className="text-base sm:text-lg font-semibold text-surface-900 tabular-nums truncate">{summary.overtimeDuration}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-3 sm:p-4 shadow-sm min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider truncate">Total</p>
                <p className="text-base sm:text-lg font-semibold text-surface-900 tabular-nums truncate">{summary.totalDuration}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white overflow-hidden shadow-sm min-w-0">
        {sessions.length === 0 ? (
          <div className="p-8 sm:p-16 text-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4 sm:mb-5">
              <Clock className="w-7 h-7 sm:w-8 sm:h-8 text-surface-400" />
            </div>
            <h3 className="text-base sm:text-lg font-medium text-surface-900">No sessions yet</h3>
            <p className="text-surface-500 mt-2 max-w-sm mx-auto text-xs sm:text-sm px-2">
              Clock in from your dashboard to start tracking. Your sessions will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-left min-w-[520px]">
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
                    Regular
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Overtime
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const displayRegularMinutes = getDisplayRegularMinutes(s)
                  return (
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
                      <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">
                        {s.status === 'completed' ? formatDuration(displayRegularMinutes) : '—'}
                      </td>
                      <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">
                        {s.overtimeMinutes != null && s.overtimeMinutes > 0
                          ? formatDuration(s.overtimeMinutes)
                          : '—'}
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
