import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Clock, Building2, ChevronLeft, ChevronRight, Search, LayoutGrid, Table2, Download } from 'lucide-react'
import { getMySchedule, type MyScheduleEntry } from '@/lib/apiEmployee'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'
import AdminSelect from '@/components/AdminSelect'
import { PageHeader } from '@/components/PageHeader'

function formatTime(t: string) {
  if (!t) return '—'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

export default function EmployeeMySchedule() {
  const [entries, setEntries] = useState<MyScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'card' | 'table'>('table')
  const [weekStart, setWeekStart] = useState(() => {
    const d = startOfWeek(new Date(), { weekStartsOn: 1 })
    return format(d, 'yyyy-MM-dd')
  })

  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')

  const fetchSchedule = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)
    try {
      const data = await getMySchedule({ from: weekStart, to: weekEnd })
      setEntries(data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load schedule')
      setEntries([])
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    fetchSchedule(true)

    const handleVisibilityChange = () => {
      if (document.hidden) return
      fetchSchedule(false)
    }

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        fetchSchedule(false)
      }
    }, 1000)

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchSchedule])

  function prevWeek() {
    setWeekStart(format(addDays(parseISO(weekStart), -7), 'yyyy-MM-dd'))
  }

  function nextWeek() {
    setWeekStart(format(addDays(parseISO(weekStart), 7), 'yyyy-MM-dd'))
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(parseISO(weekStart), i))

  const clientOptions = Array.from(new Set(entries.map((e) => e.clientName).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  const shiftOptions = Array.from(new Set(entries.map((e) => e.shiftName).filter(Boolean))).sort((a, b) => a.localeCompare(b))

  const filteredEntries = entries.filter((entry) => {
    const byClient = clientFilter === 'all' || entry.clientName === clientFilter
    const byShift = shiftFilter === 'all' || entry.shiftName === shiftFilter
    return byClient && byShift
  })

  function exportCSV() {
    if (!filteredEntries.length) return
    const headers = ['Date', 'Shift', 'Client', 'Start', 'End']
    const rows = filteredEntries.map((e) => [
      e.date ? format(parseISO(e.date), 'yyyy-MM-dd') : '',
      e.shiftName ?? '',
      e.clientName ?? '',
      formatTime(e.startTime),
      formatTime(e.endTime),
    ])
    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `my-schedule-${weekStart}-to-${weekEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="My Schedule"
        subtitle="Shifts assigned to you by your supervisor."
        icon={<CalendarDays className="w-5 h-5" />}
        actions={
          <button type="button" onClick={exportCSV} disabled={filteredEntries.length === 0} className="btn-secondary">
            <Download className="w-4 h-4 shrink-0" />
            Export CSV
          </button>
        }
      />

      {/* Filter toolbar */}
      <div className="toolbar">
        <div className="w-full sm:w-40">
          <AdminSelect
            value={clientFilter}
            onChange={(val) => setClientFilter(val)}
            options={[
              { value: 'all', label: 'All clients' },
              ...clientOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        <div className="w-full sm:w-40">
          <AdminSelect
            value={shiftFilter}
            onChange={(val) => setShiftFilter(val)}
            options={[
              { value: 'all', label: 'All shifts' },
              ...shiftOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        <div className="segmented self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={`segmented-item ${viewMode === 'card' ? 'segmented-item-active' : ''}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Card
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`segmented-item ${viewMode === 'table' ? 'segmented-item-active' : ''}`}
          >
            <Table2 className="w-3.5 h-3.5" />
            Table
          </button>
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          <button type="button" onClick={prevWeek} className="btn-icon text-surface-600 bg-white border border-surface-200 hover:bg-surface-50" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-[170px] justify-center px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
            <CalendarDays className="w-4 h-4 text-surface-500 shrink-0" />
            <span className="text-xs font-semibold text-surface-900 text-center tabular-nums whitespace-nowrap">
              {format(weekDates[0], 'd MMM')} – {format(weekDates[6], 'd MMM yyyy')}
            </span>
          </div>
          <button type="button" onClick={nextWeek} className="btn-icon text-surface-600 bg-white border border-surface-200 hover:bg-surface-50" aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-error"><span>{error}</span></div>
      )}

      {loading ? (
        <div className="card p-6 flex items-center justify-center gap-3 text-surface-500 text-sm">
          <div className="spinner" /> Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><CalendarDays className="w-5 h-5" /></div>
          <p className="empty-state-title">No shifts this week</p>
          <p className="empty-state-description">No shifts have been assigned to you for this week.</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon"><Search className="w-5 h-5" /></div>
          <p className="empty-state-title">No matches</p>
          <p className="empty-state-description">No shifts match the selected filters.</p>
        </div>
      ) : viewMode === 'card' ? (
        <ul className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredEntries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 p-3 sm:p-4 rounded-xl border border-surface-200/70 bg-white transition-all hover:shadow-card-hover hover:border-brand-200/70 min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-surface-900 truncate">{e.shiftName}</p>
                <p className="text-[11px] text-surface-500 mt-0.5 flex items-center gap-1 truncate">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate">{e.clientName}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 text-[11px] shrink-0">
                <span className="text-surface-600 font-medium">{e.date ? format(parseISO(e.date), 'EEE, d MMM') : '—'}</span>
                <span className="flex items-center gap-1 text-surface-700 font-mono tabular-nums">
                  <Clock className="w-3 h-3" />
                  {formatTime(e.startTime)}–{formatTime(e.endTime)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-surface-50/95 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.surface.200)] z-10">
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Shift</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap">Client</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">Start</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold text-surface-500 uppercase tracking-wider whitespace-nowrap text-right">End</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="border-b border-surface-100 hover:bg-brand-50/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs font-medium text-surface-900 whitespace-nowrap tabular-nums">
                      {e.date ? format(parseISO(e.date), 'EEE, d MMM') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-surface-900 font-medium whitespace-nowrap">{e.shiftName}</td>
                    <td className="px-3 py-2.5 text-xs text-surface-700 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-surface-400 shrink-0" />
                        {e.clientName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap text-right">
                      {formatTime(e.startTime)}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono text-surface-700 tabular-nums whitespace-nowrap text-right">
                      {formatTime(e.endTime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
