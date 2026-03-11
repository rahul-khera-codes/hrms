import { useState } from 'react'
import { format } from 'date-fns'
import { Search, Download, Edit2 } from 'lucide-react'
import { mockAttendanceRecords } from '@/data/mock'
import type { AttendanceRecord } from '@/types'

const statusColors: Record<AttendanceRecord['status'], string> = {
  present: 'bg-brand-100 text-brand-700',
  absent: 'bg-amber-100 text-amber-700',
  leave: 'bg-surface-100 text-surface-600',
  adjusted: 'bg-indigo-100 text-indigo-700',
}

export default function AdminAttendance() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const filtered = mockAttendanceRecords.filter((r) => {
    const matchSearch =
      r.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      r.date.includes(search)
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Attendance</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">View and manage employee attendance records.</p>
        </div>
        <button type="button" className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem]">
          <Download className="w-4 h-4 shrink-0" />
          Export
        </button>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
            <input
              type="text"
              placeholder="Search by name or date..."
              className="input pl-9 sm:pl-10 rounded-xl min-h-[2.75rem]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input w-full sm:w-auto sm:min-w-[140px] rounded-xl min-h-[2.75rem]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All status</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
            <option value="adjusted">Adjusted</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white overflow-hidden shadow-sm min-w-0">
        <div className="overflow-x-auto -mx-px">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50/80">
                <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Employee
                </th>
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
                <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider w-16 sm:w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-surface-100 last:border-0 hover:bg-surface-50/50 transition-colors"
                >
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                    <p className="text-xs sm:text-sm font-medium text-surface-900 truncate max-w-[120px] sm:max-w-none">{r.employeeName}</p>
                  </td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-mono text-surface-700 tabular-nums">
                    {r.clockIn ? format(new Date(r.clockIn), 'HH:mm') : '—'}
                  </td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-mono text-surface-700 tabular-nums">
                    {r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : '—'}
                  </td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">{r.regularHours}h</td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">{r.overtimeHours}h</td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusColors[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 sm:px-5 sm:py-3.5">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors touch-manipulation"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-8 sm:p-16 text-center">
            <p className="text-surface-500 text-xs sm:text-sm">No records match your filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}
