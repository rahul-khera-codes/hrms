import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Clock, Building2, ChevronLeft, ChevronRight, Search } from 'lucide-react'
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

  return (
    <div className="page overflow-x-hidden">
      <PageHeader
        title="My Schedule"
        subtitle="Shifts assigned to you by your supervisor."
        icon={<CalendarDays className="w-5 h-5" />}
      />

      {/* Filter toolbar */}
      <div className="toolbar">
        <div className="w-full sm:w-44">
          <AdminSelect
            value={clientFilter}
            onChange={(val) => setClientFilter(val)}
            options={[
              { value: 'all', label: 'All clients' },
              ...clientOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <AdminSelect
            value={shiftFilter}
            onChange={(val) => setShiftFilter(val)}
            options={[
              { value: 'all', label: 'All shifts' },
              ...shiftOptions.map((name) => ({ value: name, label: name })),
            ]}
          />
        </div>
        <div className="flex items-center gap-1 sm:ml-auto">
          <button type="button" onClick={prevWeek} className="btn-icon text-surface-600 bg-white border border-surface-200 hover:bg-surface-50" aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-[180px] justify-center px-3 py-2 rounded-xl bg-surface-50 border border-surface-200">
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
      ) : (
        <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
          {filteredEntries.map((e) => (
            <li
              key={e.id}
              className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 min-w-0"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-surface-900">{e.shiftName}</p>
                <p className="text-xs text-surface-500 mt-0.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {e.clientName}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs sm:text-sm shrink-0 self-start sm:self-auto">
                <span className="text-surface-600">{e.date ? format(parseISO(e.date), 'EEE, d MMM') : '—'}</span>
                <span className="flex items-center gap-1 text-surface-700">
                  <Clock className="w-4 h-4" />
                  {formatTime(e.startTime)} – {formatTime(e.endTime)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
