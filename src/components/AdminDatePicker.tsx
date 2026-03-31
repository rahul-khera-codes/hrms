import { useState, useRef, useEffect } from 'react'
import {
  format,
  parseISO,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
} from 'date-fns'

interface AdminDatePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function AdminDatePicker({ value, onChange, className = '' }: AdminDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState<string>(value || format(new Date(), 'yyyy-MM-dd'))
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = parseISO(value || '')
    return isValid(d) ? d : new Date()
  })
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (value) {
      setInternal(value)
      const d = parseISO(value)
      if (isValid(d)) setViewMonth(d)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const date = (() => {
    const d = parseISO(internal)
    return isValid(d) ? d : new Date()
  })()

  const display = format(date, 'dd-MM-yyyy')

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setInternal(next)
    onChange(next)
  }

  // Build calendar grid for current viewMonth
  const monthStart = startOfMonth(viewMonth)
  const monthEnd = endOfMonth(viewMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const weeks: Date[][] = []
  let d = new Date(calStart)
  while (d <= calEnd) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
  }

  const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

  return (
    <div ref={ref} className="relative inline-block w-full">
      <button
        type="button"
        className={
          'input w-full rounded-xl min-h-[2.75rem] flex items-center justify-between px-3 py-2 ' +
          'transition-colors duration-150 hover:bg-surface-50 focus:outline-none focus:ring-2 ' +
          'focus:ring-brand-200 focus:border-brand-400 ' +
          className
        }
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-sm text-surface-900">{display}</span>
        <span className="ml-2 text-surface-400 text-xs">{format(date, 'EEE')}</span>
      </button>
      {/* Invisible native input to keep browser logic identical */}
      <input
        type="date"
        className="sr-only"
        value={internal}
        onChange={handleNativeChange}
        tabIndex={-1}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-72 rounded-2xl border border-surface-200 bg-white shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-50"
              aria-label="Previous month"
            >
              ‹
            </button>
            <div className="text-xs font-medium text-surface-800">
              {format(viewMonth, 'MMMM, yyyy')}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-50"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px] text-surface-400 mb-1">
            {WEEKDAYS.map((dLabel) => (
              <div key={dLabel} className="text-center py-1">
                {dLabel}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {weeks.map((week) =>
              week.map((day) => {
                const iso = format(day, 'yyyy-MM-dd')
                const isToday = format(new Date(), 'yyyy-MM-dd') === iso
                const isSelected = internal === iso
                const inMonth = day.getMonth() === viewMonth.getMonth()
                let cellClass =
                  'flex items-center justify-center rounded-lg py-1.5 cursor-pointer transition-colors duration-150 '
                if (isSelected) {
                  cellClass += 'bg-brand-500 text-white'
                } else if (isToday) {
                  cellClass += 'border border-brand-300 text-brand-700 bg-brand-50'
                } else if (!inMonth) {
                  cellClass += 'text-surface-300 hover:bg-surface-50'
                } else {
                  cellClass += 'text-surface-700 hover:bg-surface-50'
                }
                return (
                  <button
                    key={iso}
                    type="button"
                    className={cellClass}
                    onClick={() => {
                      setInternal(iso)
                      onChange(iso)
                      setOpen(false)
                    }}
                  >
                    {format(day, 'd')}
                  </button>
                )
              }),
            )}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-100">
            <button
              type="button"
              className="text-[11px] text-surface-500 hover:text-surface-700"
              onClick={() => {
                const today = format(new Date(), 'yyyy-MM-dd')
                setInternal(today)
                onChange(today)
                setViewMonth(new Date())
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="text-[11px] text-surface-400 hover:text-surface-600"
              onClick={() => {
                setInternal('')
                onChange('')
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

