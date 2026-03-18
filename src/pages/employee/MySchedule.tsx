import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Clock, Building2 } from 'lucide-react'
import { getMySchedule, type MyScheduleEntry } from '@/lib/apiEmployee'
import { format, addDays, startOfWeek, parseISO } from 'date-fns'

function formatTime(t: string) {
  if (!t) return '—'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

export default function EmployeeMySchedule() {
  const [entries, setEntries] = useState<MyScheduleEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-surface-900 tracking-tight">My Schedule</h1>
        <p className="text-surface-500 mt-1 text-xs sm:text-sm">Shifts assigned to you by your supervisor.</p>
      </div>

      <div className="rounded-xl border border-surface-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={prevWeek} className="p-2 rounded-xl border border-surface-200 hover:bg-surface-50" aria-label="Previous week">
            ←
          </button>
          <div className="flex items-center gap-2 min-w-[200px] justify-center">
            <CalendarDays className="w-5 h-5 text-surface-500" />
            <span className="text-sm font-medium text-surface-900">
              {format(weekDates[0], 'd MMM')} – {format(weekDates[6], 'd MMM yyyy')}
            </span>
          </div>
          <button type="button" onClick={nextWeek} className="p-2 rounded-xl border border-surface-200 hover:bg-surface-50" aria-label="Next week">
            →
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {loading ? (
        <div className="rounded-xl border border-surface-200/80 bg-white p-8 text-center text-surface-500 text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-surface-200/80 bg-white p-8 text-center text-surface-500 text-sm">
          No shifts assigned for this week.
        </div>
      ) : (
        <ul className="p-3 sm:p-4 grid grid-cols-1 gap-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-surface-200/80 bg-white transition-all hover:shadow-md hover:border-brand-200/80 min-w-0"
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
              <div className="flex items-center gap-3 text-xs sm:text-sm shrink-0">
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
