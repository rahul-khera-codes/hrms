import { useState, useRef, useEffect, useCallback } from 'react'
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
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  className?: string
}

type Mode = 'week' | 'custom'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

export default function DateRangePicker({ startDate, endDate, onChange, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('week')
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
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setPickingEnd(false) }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  // Sync leftMonth when startDate prop changes externally
  useEffect(() => {
    if (!open) {
      const d = parseISO(startDate || '')
      if (isValid(d)) setLeftMonth(startOfMonth(d))
    }
  }, [startDate, open])

  const computePosition = useCallback(() => {
    if (!buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const calHeight = 420
    const gap = 6
    const spaceBelow = window.innerHeight - rect.bottom
    const useTop = spaceBelow < calHeight && rect.top > spaceBelow

    // On mobile (< 640px), center horizontally
    const isMobile = window.innerWidth < 640
    let left: number
    if (isMobile) {
      left = 8
    } else {
      left = rect.left + window.scrollX
      const calWidth = 580
      if (left + calWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - calWidth - 8)
      }
    }

    setPosition({
      top: useTop ? rect.top + window.scrollY - gap : rect.bottom + window.scrollY + gap,
      left,
      placement: useTop ? 'top' : 'bottom',
    })
  }, [])

  useEffect(() => {
    if (!open) return
    computePosition()
    window.addEventListener('scroll', computePosition, true)
    window.addEventListener('resize', computePosition)
    return () => {
      window.removeEventListener('scroll', computePosition, true)
      window.removeEventListener('resize', computePosition)
    }
  }, [open, computePosition])

  const rightMonth = addMonths(leftMonth, 1)
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const validStart = isValid(start) ? start : new Date()
  const validEnd = isValid(end) ? end : new Date()
  const displayText = `${format(validStart, 'MMM d, yyyy')}  –  ${format(validEnd, 'MMM d, yyyy')}`

  function handleDayClick(iso: string) {
    const clicked = parseISO(iso)
    if (mode === 'week') {
      const ws = startOfWeek(clicked, { weekStartsOn: 0 })
      const we = endOfWeek(clicked, { weekStartsOn: 0 })
      onChange(format(ws, 'yyyy-MM-dd'), format(we, 'yyyy-MM-dd'))
      setOpen(false)
      setHoverDate(null)
    } else {
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
        setHoverDate(null)
        setOpen(false)
      }
    }
  }

  /** Determine if a day falls within the visible range (selected or hovered) */
  function getRangeState(day: Date): { inRange: boolean; isStart: boolean; isEnd: boolean } {
    let rangeStart = validStart
    let rangeEnd = validEnd

    // In week mode with hover, show the hovered week
    if (mode === 'week' && hoverDate) {
      const h = parseISO(hoverDate)
      if (isValid(h)) {
        rangeStart = startOfWeek(h, { weekStartsOn: 0 })
        rangeEnd = endOfWeek(h, { weekStartsOn: 0 })
      }
    }

    // In custom mode picking end, show preview range
    if (mode === 'custom' && pickingEnd && hoverDate) {
      const s = parseISO(startDate)
      const h = parseISO(hoverDate)
      if (isValid(s) && isValid(h)) {
        rangeStart = isBefore(h, s) ? h : s
        rangeEnd = isAfter(h, s) ? h : s
      }
    }

    if (!isValid(rangeStart) || !isValid(rangeEnd)) return { inRange: false, isStart: false, isEnd: false }

    return {
      inRange: isWithinInterval(day, { start: rangeStart, end: rangeEnd }),
      isStart: isSameDay(day, rangeStart),
      isEnd: isSameDay(day, rangeEnd),
    }
  }

  function buildWeeks(month: Date): Date[][] {
    const ms = startOfMonth(month)
    const me = endOfMonth(month)
    const cs = startOfWeek(ms, { weekStartsOn: 0 })
    const ce = endOfWeek(me, { weekStartsOn: 0 })
    const weeks: Date[][] = []
    const d = new Date(cs)
    while (d <= ce) {
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
    const weeks = buildWeeks(month)
    return (
      <div className="flex-1 min-w-0">
        <div className="text-center text-sm font-semibold text-surface-800 mb-2.5 select-none">
          {format(month, 'MMMM yyyy')}
        </div>
        <div className="grid grid-cols-7 text-[10px] font-semibold text-surface-400 mb-1 select-none">
          {WEEKDAYS.map((dLabel) => (
            <div key={dLabel} className="text-center py-1 uppercase tracking-wider">{dLabel}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 text-xs">
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              const iso = format(day, 'yyyy-MM-dd')
              const isToday = format(new Date(), 'yyyy-MM-dd') === iso
              const inMonth = day.getMonth() === month.getMonth()
              const { inRange, isStart, isEnd } = getRangeState(day)

              // Build cell classes for smooth range highlight
              let outer = 'relative h-8 '
              let inner = 'relative z-10 flex items-center justify-center w-full h-full text-xs font-medium select-none transition-colors duration-75 '

              // Range background — full cell, no gap
              if (inRange) {
                outer += 'bg-brand-100 '
                if (isStart) outer += 'rounded-l-lg '
                if (isEnd) outer += 'rounded-r-lg '
              }

              // Inner circle for start/end
              if (isStart || isEnd) {
                inner += 'bg-brand-600 text-white rounded-lg '
              } else if (inRange) {
                inner += 'text-brand-800 '
              } else if (isToday && inMonth) {
                inner += 'font-bold text-brand-700 '
              } else if (!inMonth) {
                inner += 'text-surface-300 '
              } else {
                inner += 'text-surface-700 hover:bg-surface-100 rounded-lg cursor-pointer '
              }

              return (
                <div key={`${wi}-${di}`} className={outer}>
                  <button
                    type="button"
                    className={inner}
                    onClick={() => handleDayClick(iso)}
                    onMouseEnter={() => setHoverDate(iso)}
                  >
                    {format(day, 'd')}
                    {isToday && !isStart && !isEnd && inMonth && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500" />
                    )}
                  </button>
                </div>
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
          'input flex items-center gap-2.5 px-3.5 transition-all duration-150 hover:border-surface-300 ' + className
        }
        onClick={() => setOpen((o) => !o)}
      >
        <Calendar className="w-4 h-4 text-brand-500 shrink-0" />
        <span className="text-sm text-surface-900 tabular-nums whitespace-nowrap tracking-tight">{displayText}</span>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] rounded-2xl border border-surface-200/80 bg-white shadow-2xl overflow-hidden animate-in fade-in duration-150"
          style={{
            top: position.placement === 'bottom' ? `${position.top}px` : undefined,
            bottom: position.placement === 'top' ? `${window.innerHeight - position.top}px` : undefined,
            left: `${position.left}px`,
            width: window.innerWidth < 640 ? 'calc(100vw - 16px)' : 'auto',
            maxWidth: 'calc(100vw - 16px)',
          }}
          onMouseLeave={() => { if (!pickingEnd) setHoverDate(null) }}
        >
          {/* Header bar */}
          <div className="px-4 pt-4 pb-3 border-b border-surface-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-lg overflow-hidden border border-surface-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => { setMode('week'); setPickingEnd(false) }}
                  className={`px-3 py-1.5 font-semibold tracking-wide uppercase transition-colors ${mode === 'week' ? 'bg-brand-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('custom'); setPickingEnd(false) }}
                  className={`px-3 py-1.5 font-semibold tracking-wide uppercase transition-colors ${mode === 'custom' ? 'bg-brand-600 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}
                >
                  Custom
                </button>
              </div>
            </div>
            <p className="text-[11px] text-surface-400 font-medium">
              {mode === 'week' ? 'Click any day to select Sun – Sat week' : pickingEnd ? 'Now click to set end date' : 'Click to set start date'}
            </p>
          </div>

          {/* Calendars */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLeftMonth((m) => subMonths(m, 1))}
                className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-8 flex-1 min-w-0">
                {renderCalendar(leftMonth)}
                <div className="hidden sm:block">
                  {renderCalendar(rightMonth)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLeftMonth((m) => addMonths(m, 1))}
                className="p-1.5 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-surface-100 bg-surface-50/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
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
              <span className="w-px h-3.5 bg-surface-200" />
              <button
                type="button"
                className="text-xs font-semibold text-surface-500 hover:text-surface-700 transition-colors"
                onClick={() => {
                  const prev = new Date()
                  prev.setDate(prev.getDate() - 7)
                  const ws = startOfWeek(prev, { weekStartsOn: 0 })
                  const we = endOfWeek(prev, { weekStartsOn: 0 })
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
              className="text-xs font-semibold text-surface-400 hover:text-surface-600 transition-colors"
              onClick={() => { setOpen(false); setPickingEnd(false); setHoverDate(null) }}
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
