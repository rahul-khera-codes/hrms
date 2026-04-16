import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
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
  isSameDay,
  isWithinInterval,
  isBefore,
  isAfter,
} from 'date-fns'

interface DateRangePickerProps {
  startDate: string // yyyy-MM-dd
  endDate: string   // yyyy-MM-dd
  onChange: (start: string, end: string) => void
  className?: string
}

type Mode = 'week' | 'custom'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function DateRangePicker({ startDate, endDate, onChange, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('week')
  // For custom mode: track which end the user is picking
  const [pickingEnd, setPickingEnd] = useState(false)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const [leftMonth, setLeftMonth] = useState<Date>(() => {
    const d = parseISO(startDate || '')
    return isValid(d) ? startOfMonth(d) : startOfMonth(new Date())
  })

  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({ top: 0, left: 0, placement: 'bottom' })

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
      setPickingEnd(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setPickingEnd(false) }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  // Position the dropdown
  useEffect(() => {
    if (!open || !buttonRef.current) return
    function computePosition() {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const calHeight = 380
      const calWidth = 600
      const gap = 4
      const spaceBelow = window.innerHeight - rect.bottom
      const useTop = spaceBelow < calHeight && rect.top > spaceBelow
      let left = rect.left + window.scrollX
      if (left + calWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - calWidth - 8)
      }
      setPosition({
        top: useTop ? rect.top + window.scrollY - gap : rect.bottom + window.scrollY + gap,
        left,
        placement: useTop ? 'top' : 'bottom',
      })
    }
    computePosition()
    window.addEventListener('scroll', computePosition, true)
    window.addEventListener('resize', computePosition)
    return () => {
      window.removeEventListener('scroll', computePosition, true)
      window.removeEventListener('resize', computePosition)
    }
  }, [open])

  const rightMonth = addMonths(leftMonth, 1)

  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const validStart = isValid(start) ? start : new Date()
  const validEnd = isValid(end) ? end : new Date()

  const displayText = `${format(validStart, 'MMM d, yyyy')} - ${format(validEnd, 'MMM d, yyyy')}`

  function handleDayClick(iso: string) {
    const clicked = parseISO(iso)

    if (mode === 'week') {
      // Auto-select full Sun-Sat week
      const weekStart = startOfWeek(clicked, { weekStartsOn: 0 })
      const weekEnd = endOfWeek(clicked, { weekStartsOn: 0 })
      onChange(format(weekStart, 'yyyy-MM-dd'), format(weekEnd, 'yyyy-MM-dd'))
      setOpen(false)
    } else {
      // Custom mode: first click = start, second click = end
      if (!pickingEnd) {
        onChange(iso, iso)
        setPickingEnd(true)
      } else {
        const s = parseISO(startDate)
        if (isBefore(clicked, s)) {
          onChange(iso, format(s, 'yyyy-MM-dd'))
        } else {
          onChange(format(s, 'yyyy-MM-dd'), iso)
        }
        setPickingEnd(false)
        setOpen(false)
      }
    }
  }

  function isInRange(day: Date): boolean {
    if (mode === 'custom' && pickingEnd && hoverDate) {
      const s = parseISO(startDate)
      const h = parseISO(hoverDate)
      if (!isValid(s) || !isValid(h)) return false
      const rangeStart = isBefore(h, s) ? h : s
      const rangeEnd = isAfter(h, s) ? h : s
      return isWithinInterval(day, { start: rangeStart, end: rangeEnd })
    }
    if (!isValid(validStart) || !isValid(validEnd)) return false
    return isWithinInterval(day, { start: validStart, end: validEnd })
  }

  function renderMonth(month: Date) {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
    const weeks: Date[][] = []
    const d = new Date(calStart)
    while (d <= calEnd) {
      const week: Date[] = []
      for (let i = 0; i < 7; i++) {
        week.push(new Date(d))
        d.setDate(d.getDate() + 1)
      }
      weeks.push(week)
    }
    return weeks
  }

  function renderCalendar(month: Date) {
    const weeks = renderMonth(month)
    return (
      <div className="flex-1 min-w-0">
        <div className="text-center text-sm font-semibold text-surface-800 mb-2">
          {format(month, 'MMMM yyyy')}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-[11px] font-semibold text-surface-400 mb-1">
          {WEEKDAYS.map((dLabel) => (
            <div key={dLabel} className="text-center py-1 uppercase">{dLabel}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-xs">
          {weeks.map((week) =>
            week.map((day) => {
              const iso = format(day, 'yyyy-MM-dd')
              const isToday = format(new Date(), 'yyyy-MM-dd') === iso
              const inMonth = day.getMonth() === month.getMonth()
              const isStart = isValid(validStart) && isSameDay(day, validStart)
              const isEnd = isValid(validEnd) && isSameDay(day, validEnd)
              const inRange = isInRange(day)

              let cellClass = 'flex items-center justify-center h-8 cursor-pointer transition-colors duration-100 font-medium relative '

              if (isStart || isEnd) {
                cellClass += 'bg-brand-600 text-white z-10 '
                cellClass += isStart ? 'rounded-l-lg ' : ''
                cellClass += isEnd ? 'rounded-r-lg ' : ''
                if (isStart && isEnd) cellClass += 'rounded-lg '
              } else if (inRange) {
                cellClass += 'bg-brand-100 text-brand-800 '
              } else if (isToday) {
                cellClass += 'border border-brand-300 text-brand-700 bg-brand-50 rounded-lg '
              } else if (!inMonth) {
                cellClass += 'text-surface-300 '
              } else {
                cellClass += 'text-surface-700 hover:bg-surface-100 rounded-lg '
              }

              return (
                <button
                  key={iso}
                  type="button"
                  className={cellClass}
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => { if (mode === 'custom' && pickingEnd) setHoverDate(iso) }}
                >
                  {format(day, 'd')}
                </button>
              )
            }),
          )}
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="relative inline-block w-full">
      <button
        ref={buttonRef}
        type="button"
        className={
          'input flex items-center gap-2 px-3 transition-colors duration-150 hover:bg-surface-50 ' + className
        }
        onClick={() => setOpen((o) => !o)}
      >
        <Calendar className="w-4 h-4 text-surface-400 shrink-0" />
        <span className="text-sm text-surface-900 tabular-nums whitespace-nowrap">{displayText}</span>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] rounded-2xl border border-surface-200 bg-white shadow-xl p-4"
          style={{
            top: position.placement === 'bottom' ? `${position.top}px` : undefined,
            bottom: position.placement === 'top' ? `${window.innerHeight - position.top}px` : undefined,
            left: `${position.left}px`,
            width: 'auto',
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          {/* Mode toggle */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex rounded-lg overflow-hidden border border-surface-200 text-xs">
              <button
                type="button"
                onClick={() => { setMode('week'); setPickingEnd(false) }}
                className={`px-3 py-1.5 font-medium transition-colors ${mode === 'week' ? 'bg-brand-600 text-white' : 'bg-white text-surface-600 hover:bg-surface-50'}`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => { setMode('custom'); setPickingEnd(false) }}
                className={`px-3 py-1.5 font-medium transition-colors ${mode === 'custom' ? 'bg-brand-600 text-white' : 'bg-white text-surface-600 hover:bg-surface-50'}`}
              >
                Custom
              </button>
            </div>
            <span className="text-[11px] text-surface-400">
              {mode === 'week' ? 'Click any day to select Sun–Sat week' : pickingEnd ? 'Click to set end date' : 'Click to set start date'}
            </span>
          </div>

          {/* Month navigation + two calendars */}
          <div className="flex items-start gap-4">
            <button
              type="button"
              onClick={() => setLeftMonth((m) => subMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-50 hover:text-surface-800 mt-0.5"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-6 flex-1">
              {renderCalendar(leftMonth)}
              <div className="hidden sm:block">
                {renderCalendar(rightMonth)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLeftMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-50 hover:text-surface-800 mt-0.5"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-surface-100">
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => {
                  const now = new Date()
                  const ws = startOfWeek(now, { weekStartsOn: 0 })
                  const we = endOfWeek(now, { weekStartsOn: 0 })
                  onChange(format(ws, 'yyyy-MM-dd'), format(we, 'yyyy-MM-dd'))
                  setLeftMonth(startOfMonth(now))
                  setOpen(false)
                }}
              >
                This week
              </button>
              <button
                type="button"
                className="text-xs font-medium text-surface-500 hover:text-surface-700"
                onClick={() => {
                  const now = new Date()
                  const prevWeekDay = new Date(now)
                  prevWeekDay.setDate(prevWeekDay.getDate() - 7)
                  const ws = startOfWeek(prevWeekDay, { weekStartsOn: 0 })
                  const we = endOfWeek(prevWeekDay, { weekStartsOn: 0 })
                  onChange(format(ws, 'yyyy-MM-dd'), format(we, 'yyyy-MM-dd'))
                  setLeftMonth(startOfMonth(ws))
                  setOpen(false)
                }}
              >
                Last week
              </button>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-surface-400 hover:text-surface-600"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
