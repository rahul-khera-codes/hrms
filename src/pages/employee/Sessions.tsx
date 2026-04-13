import { useState, useMemo, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import { getSessions } from '@/lib/apiSessions'
import type { ClockSession } from '@/types'
import { Clock, Calendar, TrendingUp, Zap } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

const SESSIONS_PER_PAGE = 10

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
  const [currentPage, setCurrentPage] = useState(1)

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
      totalDuration: formatDuration(regularMin + overtimeMin),
    }
  }, [sessions])

  const totalPages = Math.max(1, Math.ceil(sessions.length / SESSIONS_PER_PAGE))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * SESSIONS_PER_PAGE
  const paginatedSessions = sessions.slice(pageStart, pageStart + SESSIONS_PER_PAGE)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  if (loading) {
    return (
      <div className="page">
        <PageHeader title="My Sessions" subtitle="View and manage your clock-in / clock-out history." icon={<Clock className="w-5 h-5" />} />
        <div className="card p-6 flex items-center gap-3 text-surface-500 text-sm">
          <div className="spinner" /> Loading sessions…
        </div>
      </div>
    )
  }

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="My Sessions"
        subtitle="View and manage your clock-in / clock-out history."
        icon={<Clock className="w-5 h-5" />}
      />

      {sessions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="stat-card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-surface-100 border border-surface-200 text-surface-600 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="stat-label truncate">Sessions</p>
              <p className="stat-value truncate">{summary.sessions}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="stat-label truncate">Regular</p>
              <p className="stat-value truncate">{summary.regularDuration}</p>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="stat-label truncate">Overtime</p>
              <p className="stat-value truncate">{summary.overtimeDuration}</p>
            </div>
          </div>
          <div className="stat-card bg-brand-50/40 border-brand-200/70 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="stat-label truncate text-brand-700">Total</p>
              <p className="stat-value truncate">{summary.totalDuration}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock className="w-5 h-5" /></div>
            <p className="empty-state-title">No sessions yet</p>
            <p className="empty-state-description">Clock in from your dashboard to start tracking. Your sessions will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock In</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Clock Out</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">Regular</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">Overtime</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSessions.map((s) => {
                  const displayRegularMinutes = getDisplayRegularMinutes(s)
                  return (
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
                      <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap text-right">
                        {s.status === 'completed' ? formatDuration(displayRegularMinutes) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-xs font-mono tabular-nums whitespace-nowrap text-right ${s.overtimeMinutes && s.overtimeMinutes > 0 ? 'text-amber-700 font-semibold' : 'text-surface-400'}`}>
                        {s.overtimeMinutes != null && s.overtimeMinutes > 0 ? formatDuration(s.overtimeMinutes) : '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`${s.status === 'active' ? 'badge-warning' : 'badge-neutral'} capitalize`}>
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

      {sessions.length > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <p className="text-xs text-surface-500">
            Showing {pageStart + 1}–{Math.min(pageStart + SESSIONS_PER_PAGE, sessions.length)} of {sessions.length}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="btn-secondary btn-sm flex-1 sm:flex-none"
            >
              Previous
            </button>
            <span className="text-xs font-medium text-surface-600 min-w-[80px] text-center">
              Page {safeCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="btn-secondary btn-sm flex-1 sm:flex-none"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
