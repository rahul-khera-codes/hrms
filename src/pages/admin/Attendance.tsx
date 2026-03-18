import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, subDays } from 'date-fns'
import { Search, Download } from 'lucide-react'
import { getAdminAttendance } from '@/lib/apiAdmin'
import type { AttendanceRecord } from '@/types'
import AdminSelect from '@/components/AdminSelect'
import AdminDatePicker from '@/components/AdminDatePicker'

const statusColors: Record<string, string> = {
  present: 'bg-brand-100 text-brand-700',
  active: 'bg-amber-100 text-amber-700',
  absent: 'bg-amber-100 text-amber-700',
  leave: 'bg-surface-100 text-surface-600',
  adjusted: 'bg-indigo-100 text-indigo-700',
}

function formatDurationFromHours(hours: number) {
  const totalSeconds = Math.max(0, Math.round(hours * 3600))
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  return [hh, mm, ss].map((v) => String(v).padStart(2, '0')).join(':')
}

export default function AdminAttendance() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const fetchAttendance = useCallback(async () => {
    try {
      const list = await getAdminAttendance({
        from: dateFrom,
        to: dateTo,
        search: search.trim() || undefined,
        status: statusFilter,
      })
      setRecords(list)
      setLoading(false)
    } catch {
      setRecords([])
      setLoading(false)
    }
  }, [dateFrom, dateTo, search, statusFilter])

  useEffect(() => {
    fetchAttendance()

    // Poll every 3 seconds when page is visible
    const handleVisibilityChange = () => {
      if (document.hidden) return
      fetchAttendance()
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        fetchAttendance()
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchAttendance])

  function exportAttendanceCSV() {
    if (!records.length) return
    const headers = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Regular', 'Overtime', 'Night', 'Total', 'Status']
    const rows = records.map((r) => [
      r.employeeName,
      r.date,
      r.clockIn ? format(new Date(r.clockIn), 'HH:mm:ss') : '',
      r.clockOut ? format(new Date(r.clockOut), 'HH:mm:ss') : '',
      formatDurationFromHours(r.regularHours),
      formatDurationFromHours(r.overtimeHours),
      formatDurationFromHours(r.nightHours),
      formatDurationFromHours(r.regularHours + r.overtimeHours + r.nightHours),
      r.status,
    ])
    const csv = [headers.join(','), ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${dateFrom}-to-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = records
  const summary = useMemo(() => {
    const total = filtered.length
    const present = filtered.filter((r) => r.status === 'present').length
    const active = filtered.filter((r) => r.status === 'active').length
    const absent = filtered.filter((r) => r.status === 'absent').length
    const leave = filtered.filter((r) => r.status === 'leave').length
    const adjusted = filtered.filter((r) => r.status === 'adjusted').length
    const totalHours = filtered.reduce((acc, r) => acc + r.regularHours + r.overtimeHours + r.nightHours, 0)
    return {
      total,
      present,
      active,
      absent,
      leave,
      adjusted,
      totalDuration: formatDurationFromHours(totalHours),
    }
  }, [filtered])

  return (
    <div className="space-y-4 sm:space-y-6 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">Attendance</h1>
          <p className="text-surface-500 mt-1 text-xs sm:text-sm">View and manage employee attendance records.</p>
        </div>
        <button
          type="button"
          onClick={exportAttendanceCSV}
          disabled={loading || records.length === 0}
          className="btn-secondary flex items-center justify-center gap-2 rounded-xl w-full sm:w-auto min-h-[2.75rem] disabled:opacity-50"
        >
          <Download className="w-4 h-4 shrink-0" />
          Export
        </button>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 shrink-0" />
              <input
                type="text"
                placeholder="Search by name"
                className="input pl-9 sm:pl-10 rounded-xl min-h-[2.75rem]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <AdminDatePicker value={dateFrom} onChange={(val) => setDateFrom(val)} />
              </div>
              <div className="flex-1 min-w-[140px]">
                <AdminDatePicker value={dateTo} onChange={(val) => setDateTo(val)} />
              </div>
            </div>
            <AdminSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: 'all', label: 'All status' },
                { value: 'present', label: 'Present' },
                { value: 'active', label: 'Active (clocked in)' },
                { value: 'absent', label: 'Absent' },
                { value: 'leave', label: 'Leave' },
                { value: 'adjusted', label: 'Adjusted' },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Records</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.total}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-brand-200/80 bg-brand-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-brand-700 uppercase tracking-wider">Present</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.present}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-amber-700 uppercase tracking-wider">Active</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.active}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-red-200/80 bg-red-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-red-700 uppercase tracking-wider">Absent</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.absent}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-surface-200/80 bg-white p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-surface-500 uppercase tracking-wider">Leave</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.leave}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-indigo-200/80 bg-indigo-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-indigo-700 uppercase tracking-wider">Adjusted</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.adjusted}</p>
        </div>
        <div className="rounded-lg sm:rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 sm:p-4 shadow-sm">
          <p className="text-[10px] sm:text-xs font-medium text-emerald-700 uppercase tracking-wider">Worked</p>
          <p className="mt-1 text-lg sm:text-xl font-semibold text-surface-900 tabular-nums">{summary.totalDuration}</p>
        </div>
      </div>

      <div className="rounded-xl sm:rounded-2xl border border-surface-200/80 bg-white overflow-hidden shadow-sm min-w-0">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto -mx-px">
            <table className="w-full text-left min-w-[700px] border-separate [border-spacing:0_8px] px-2">
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
                    Night
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-[10px] sm:text-xs font-semibold text-surface-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="bg-white ring-1 ring-surface-200/80 hover:shadow-md hover:ring-brand-200/80 transition-all"
                  >
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 rounded-l-xl">
                      <p className="text-xs sm:text-sm font-medium text-surface-900 truncate max-w-[120px] sm:max-w-none">{r.employeeName}</p>
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums whitespace-nowrap">{r.date}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-mono text-surface-700 tabular-nums">
                      {r.clockIn ? format(new Date(r.clockIn), 'HH:mm:ss') : '—'}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-mono text-surface-700 tabular-nums">
                      {r.clockOut ? format(new Date(r.clockOut), 'HH:mm:ss') : '—'}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">{formatDurationFromHours(r.regularHours)}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">{formatDurationFromHours(r.overtimeHours)}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm text-surface-700 tabular-nums">{formatDurationFromHours(r.nightHours)}</td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-medium text-surface-900 tabular-nums">
                      {formatDurationFromHours(r.regularHours + r.overtimeHours + r.nightHours)}
                    </td>
                    <td className="px-3 py-2.5 sm:px-5 sm:py-3.5 rounded-r-xl">
                      <span className={`inline-flex items-center px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium ${statusColors[r.status] ?? 'bg-surface-100 text-surface-600'}`}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-8 sm:p-16 text-center">
            <p className="text-surface-500 text-xs sm:text-sm">No records match your filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}
