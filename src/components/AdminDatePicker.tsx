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
} from 'date-fns'

interface AdminDatePickerProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

const CAL_WIDTH = 288 // ~w-72

export default function AdminDatePicker({ value, onChange, className = '' }: AdminDatePickerProps) {
  const [open, setOpen] = useState(false)
  const [internal, setInternal] = useState<string>(value || format(new Date(), 'yyyy-MM-dd'))
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const d = parseISO(value || '')
    return isValid(d) ? d : new Date()
  })
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{
    top: number
    left: number
    placement: 'bottom' | 'top'
  }>({ top: 0, left: 0, placement: 'bottom' })

  useEffect(() => {
    if (value) {
      setInternal(value)
      const d = parseISO(value)
      if (isValid(d)) setViewMonth(d)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (wrapperRef.current && wrapperRef.current.contains(target)) return
      if (dropdownRef.current && dropdownRef.current.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  // Compute portal position + flip
  useEffect(() => {
    if (!open || !buttonRef.current) return

    function computePosition() {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const calHeight = 340
      const gap = 4
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const useTop = spaceBelow < calHeight && spaceAbove > spaceBelow

      let left = rect.left + window.scrollX
      // Prevent overflow right edge
      if (left + CAL_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - CAL_WIDTH - 8)
      }

      setPosition({
        top: useTop
          ? rect.top + window.scrollY - gap
          : rect.bottom + window.scrollY + gap,
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

  const date = (() => {
    const d = parseISO(internal)
    return isValid(d) ? d : new Date()
  })()

  // Display: "Apr 16, 2026" (standard, locale-friendly, never wraps in 170px column).
  const display = format(date, 'MMM d, yyyy')

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value
    setInternal(next)
    onChange(next)
  }

  // Build calendar grid
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
    <div ref={wrapperRef} className="relative inline-block w-full">
      <button
        ref={buttonRef}
        type="button"
        className={
          'input flex items-center justify-between px-3 ' +
          'transition-colors duration-150 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 ' +
          className
        }
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
          <span className="text-sm text-surface-900 dark:text-surface-50 tabular-nums whitespace-nowrap">{display}</span>
        </span>
        <span className="ml-2 text-surface-400 dark:text-surface-500 text-[11px] uppercase tracking-wider font-medium shrink-0 whitespace-nowrap">{format(date, 'EEE')}</span>
      </button>
      {/* Invisible native input to keep browser logic identical */}
      <input
        type="date"
        className="sr-only"
        value={internal}
        onChange={handleNativeChange}
        tabIndex={-1}
      />
      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] rounded-2xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl p-3"
          style={{
            top: position.placement === 'bottom' ? `${position.top}px` : undefined,
            bottom: position.placement === 'top'
              ? `${window.innerHeight - position.top}px`
              : undefined,
            left: `${position.left}px`,
            width: `${CAL_WIDTH}px`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 hover:text-surface-800 dark:text-surface-100"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-semibold text-surface-800 dark:text-surface-100">
              {format(viewMonth, 'MMMM yyyy')}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="p-1.5 rounded-lg text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 hover:text-surface-800 dark:text-surface-100"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold text-surface-400 dark:text-surface-500 mb-1">
            {WEEKDAYS.map((dLabel) => (
              <div key={dLabel} className="text-center py-1 uppercase">
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
                  'flex items-center justify-center rounded-lg h-8 cursor-pointer transition-colors duration-150 font-medium '
                if (isSelected) {
                  cellClass += 'bg-brand-600 text-white shadow-sm hover:bg-brand-700'
                } else if (isToday) {
                  cellClass += 'border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100'
                } else if (!inMonth) {
                  cellClass += 'text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900'
                } else {
                  cellClass += 'text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800'
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
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-surface-100 dark:border-surface-800">
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
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
              className="text-xs font-medium text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:text-surface-300"
              onClick={() => {
                setInternal('')
                onChange('')
              }}
            >
              Clear
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
