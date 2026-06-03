import { useState, useEffect } from 'react'
import { format } from 'date-fns'
// 03JUN2026 — clock times go through the AST 12-hour helper
import { fmtTime as fmtTimeAST } from '@/lib/timeFormat'
import { Link } from 'react-router-dom'
import { Users, Clock, FileCheck, AlertCircle, ChevronRight, TrendingUp, LayoutDashboard } from 'lucide-react'
import { getAdminDashboard } from '@/lib/apiAdmin'
import { PageHeader } from '@/components/PageHeader'

export default function AdminDashboard() {
  const [stats, setStats] = useState<{
    totalEmployees: number
    presentToday: number
    absentToday: number
    pendingAdjustments: number
  } | null>(null)
  const [recentAttendance, setRecentAttendance] = useState<Array<{
    id: string
    employeeName: string
    date: string
    clockIn: string | null
    clockOut: string | null
    status: string
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchDashboard = async () => {
      try {
        const data = await getAdminDashboard()
        if (cancelled) return
        setStats({
          totalEmployees: data.totalEmployees,
          presentToday: data.presentToday,
          absentToday: data.absentToday,
          pendingAdjustments: data.pendingAdjustments,
        })
        setRecentAttendance(data.recentAttendance ?? [])
      } catch {
        if (!cancelled) {
          setStats({ totalEmployees: 0, presentToday: 0, absentToday: 0, pendingAdjustments: 0 })
          setRecentAttendance([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDashboard()

    const handleVisibilityChange = () => { if (!document.hidden) fetchDashboard() }
    const intervalId = window.setInterval(() => { if (!document.hidden) fetchDashboard() }, 1000)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const statCards = stats
    ? [
        {
          label: 'Present today',
          value: stats.presentToday,
          sub: `of ${stats.totalEmployees} employees`,
          icon: Clock,
          tone: 'brand' as const,
        },
        {
          label: 'Absent today',
          value: stats.absentToday,
          sub: 'no punch today',
          icon: AlertCircle,
          tone: 'amber' as const,
        },
        {
          label: 'Total employees',
          value: stats.totalEmployees,
          sub: 'active',
          icon: Users,
          tone: 'surface' as const,
        },
        {
          label: 'Pending adjustments',
          value: stats.pendingAdjustments,
          sub: 'attendance edits',
          icon: FileCheck,
          tone: 'indigo' as const,
        },
      ]
    : []

  const toneStyles = {
    brand: 'bg-brand-50 text-brand-600 border-brand-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    surface: 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300 border-surface-200 dark:border-surface-700',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  }

  // 'active' on Dashboard means "currently clocked in" (not a terminal status),
  // so we treat it as info, with present/adjusted as success and absent as danger.
  const statusBadge = (status: string) => {
    if (status === 'present' || status === 'adjusted' || status === 'completed') return 'badge-success'
    if (status === 'active') return 'badge-info'
    if (status === 'absent') return 'badge-danger'
    if (status === 'pending' || status === 'late') return 'badge-warning'
    return 'badge-neutral'
  }

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of attendance and payroll activity"
        icon={<LayoutDashboard className="w-5 h-5" />}
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-3 bg-surface-200 rounded w-20 mb-2" />
              <div className="h-7 bg-surface-200 rounded w-12 mb-1" />
              <div className="h-2.5 bg-surface-100 dark:bg-surface-800 rounded w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map(({ label, value, sub, icon: Icon, tone }) => (
            <div key={label} className="stat-card hover:shadow-card-hover transition-shadow group">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="stat-label truncate">{label}</p>
                  <p className="stat-value truncate">{value}</p>
                  <p className="text-[11px] text-surface-400 dark:text-surface-500 mt-0.5 truncate">{sub}</p>
                </div>
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${toneStyles[tone]}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="card lg:col-span-2">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Recent attendance</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Latest clock-in activity (last 7 days)</p>
            </div>
            <Link to="/admin/attendance" className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-surface-100 dark:bg-surface-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentAttendance.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><Clock className="w-5 h-5" /></div>
                <p className="empty-state-title">No recent attendance</p>
                <p className="empty-state-description">Attendance records will appear here as employees clock in.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentAttendance.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-xl bg-white dark:bg-surface-900 ring-1 ring-surface-200/70 hover:ring-brand-200/80 hover:bg-brand-50/20 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-500 dark:text-surface-400 dark:text-surface-500 text-xs font-semibold shrink-0">
                        {r.employeeName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">{r.employeeName}</p>
                        <p className="text-[11px] text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5 truncate">
                          {format(new Date(r.date), 'MMM d')} · {r.clockIn ? fmtTimeAST(r.clockIn) : '—'} – {r.clockOut ? fmtTimeAST(r.clockOut) : '—'}
                        </p>
                      </div>
                    </div>
                    <span className={`${statusBadge(r.status)} shrink-0 capitalize`}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">Quick actions</h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 dark:text-surface-500 mt-0.5">Common tasks</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="p-4 space-y-2">
            {[
              { to: '/admin/attendance', label: 'Review attendance records', icon: Clock },
              { to: '/admin/payroll', label: 'Run payroll calculation', icon: FileCheck },
              { to: '/admin/reports', label: 'Export payroll report', icon: TrendingUp },
              { to: '/admin/leave-requests', label: 'Pending leave reviews', icon: AlertCircle },
            ].map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between gap-3 rounded-xl border border-surface-200/70 px-3 py-2.5 text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 hover:border-brand-200 hover:text-brand-700 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 text-surface-400 dark:text-surface-500 group-hover:text-brand-600 shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-surface-400 dark:text-surface-500 group-hover:text-brand-600 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
