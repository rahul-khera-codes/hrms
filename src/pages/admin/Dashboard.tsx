import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { Users, Clock, FileCheck, AlertCircle, ChevronRight } from 'lucide-react'
import { mockAttendanceRecords } from '@/data/mock'

export default function AdminDashboard() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const presentToday = mockAttendanceRecords.filter(
    (r) => r.date === today && (r.status === 'present' || r.status === 'adjusted')
  ).length
  const absentToday = mockAttendanceRecords.filter((r) => r.date === today && r.status === 'absent').length
  const totalEmployees = 4
  const pendingAdjustments = mockAttendanceRecords.filter((r) => r.status === 'adjusted').length

  const stats = [
    {
      label: 'Present today',
      value: presentToday,
      sub: `of ${totalEmployees} employees`,
      icon: Clock,
      color: 'bg-brand-50 text-brand-600',
    },
    {
      label: 'Absent today',
      value: absentToday,
      sub: 'requires review',
      icon: AlertCircle,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Total employees',
      value: totalEmployees,
      sub: 'active',
      icon: Users,
      color: 'bg-surface-100 text-surface-600',
    },
    {
      label: 'Pending adjustments',
      value: pendingAdjustments,
      sub: 'attendance edits',
      icon: FileCheck,
      color: 'bg-indigo-50 text-indigo-600',
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Dashboard</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Overview of attendance and payroll.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-5 shadow-sm hover:shadow-md transition-shadow min-w-0"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider truncate">{label}</p>
                <p className="text-lg sm:text-2xl font-semibold text-surface-900 mt-0.5 sm:mt-1 tabular-nums truncate">{value}</p>
                <p className="text-[10px] sm:text-xs text-surface-400 mt-0.5 truncate">{sub}</p>
              </div>
              <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Recent attendance</h2>
          <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">Latest clock-in activity</p>
          <div className="space-y-0">
            {mockAttendanceRecords.slice(0, 5).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 py-3 sm:py-3.5 border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors rounded-lg px-2 -mx-2 min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-surface-900 truncate">{r.employeeName}</p>
                  <p className="text-[10px] sm:text-xs text-surface-500 mt-0.5 truncate">
                    {format(new Date(r.date), 'MMM d')} · {r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '—'} –{' '}
                    {r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '—'}
                  </p>
                </div>
                <span
                  className={
                    r.status === 'present' || r.status === 'adjusted'
                      ? 'inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-brand-100 text-brand-700 shrink-0'
                      : r.status === 'absent'
                        ? 'inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-amber-100 text-amber-700 shrink-0'
                        : 'inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium bg-surface-100 text-surface-600 shrink-0'
                  }
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-4 sm:p-6 shadow-sm min-w-0">
          <h2 className="text-sm sm:text-base font-semibold text-surface-900 mb-0.5 sm:mb-1">Quick actions</h2>
          <p className="text-xs sm:text-sm text-surface-500 mb-4 sm:mb-5">Common tasks</p>
          <div className="space-y-2">
            <Link
              to="/admin/attendance"
              className="flex items-center justify-between gap-2 rounded-xl border border-surface-200/80 px-3 py-3 sm:px-4 sm:py-3.5 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-300 transition-colors group"
            >
              <span className="truncate">Review attendance records</span>
              <ChevronRight className="w-4 h-4 text-surface-400 group-hover:text-surface-600 shrink-0" />
            </Link>
            <Link
              to="/admin/payroll"
              className="flex items-center justify-between gap-2 rounded-xl border border-surface-200/80 px-3 py-3 sm:px-4 sm:py-3.5 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-300 transition-colors group"
            >
              <span className="truncate">Run payroll calculation</span>
              <ChevronRight className="w-4 h-4 text-surface-400 group-hover:text-surface-600 shrink-0" />
            </Link>
            <Link
              to="/admin/reports"
              className="flex items-center justify-between gap-2 rounded-xl border border-surface-200/80 px-3 py-3 sm:px-4 sm:py-3.5 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:border-surface-300 transition-colors group"
            >
              <span className="truncate">Export payroll report</span>
              <ChevronRight className="w-4 h-4 text-surface-400 group-hover:text-surface-600 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
