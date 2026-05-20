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

interface Props {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  className?: string
}

type Mode = 'week' | 'custom'
const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const CELL = 36 // px per cell
const CAL_W = CELL * 7 // 252px per calendar
const GAP = 32 // gap between calendars
const PAD = 20 // horizontal padding each side
const POPUP_W = PAD + CAL_W + GAP + CAL_W + PAD // ~576

export default function DateRangePicker({ startDate, endDate, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('week')
  const [pickingEnd, setPickingEnd] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [leftMonth, setLeftMonth] = useState<Date>(() => {
    const d = parseISO(startDate || '')
    return isValid(d) ? startOfMonth(d) : startOfMonth(new Date())
  })

  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0, flip: false })

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false); setPickingEnd(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPickingEnd(false) } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Sync month view when closed
  useEffect(() => {
    if (!open) {
      const d = parseISO(startDate || '')
      if (isValid(d)) setLeftMonth(startOfMonth(d))
    }
  }, [startDate, open])

  // Position
  const reposition = useCallback(() => {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const gap = 6
    const h = 440
    const flip = (window.innerHeight - r.bottom) < h && r.top > (window.innerHeight - r.bottom)
    const mobile = window.innerWidth < 640
    let left = mobile ? 8 : r.left + window.scrollX
    if (!mobile && left + POPUP_W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - POPUP_W - 8)
    setPos({ top: flip ? r.top + window.scrollY - gap : r.bottom + window.scrollY + gap, left, flip })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition) }
  }, [open, reposition])

  const rightMonth = addMonths(leftMonth, 1)
  const s = parseISO(startDate)
  const e = parseISO(endDate)
  const vs = isValid(s) ? s : new Date()
  const ve = isValid(e) ? e : new Date()

  // Resolve visible range (accounts for hover preview)
  function getRange(): { rs: Date; re: Date } | null {
    if (mode === 'week' && hover) {
      const h = parseISO(hover)
      if (isValid(h)) return { rs: startOfWeek(h, { weekStartsOn: 0 }), re: endOfWeek(h, { weekStartsOn: 0 }) }
    }
    if (mode === 'custom' && pickingEnd && hover) {
      const h = parseISO(hover)
      if (isValid(vs) && isValid(h)) return { rs: isBefore(h, vs) ? h : vs, re: isAfter(h, vs) ? h : vs }
    }
    if (isValid(vs) && isValid(ve)) return { rs: vs, re: ve }
    return null
  }

  function handleClick(iso: string) {
    const c = parseISO(iso)
    if (mode === 'week') {
      onChange(format(startOfWeek(c, { weekStartsOn: 0 }), 'yyyy-MM-dd'), format(endOfWeek(c, { weekStartsOn: 0 }), 'yyyy-MM-dd'))
      setOpen(false); setHover(null)
    } else if (!pickingEnd) {
      onChange(iso, iso); setPickingEnd(true)
    } else {
      const st = parseISO(startDate)
      if (isBefore(c, st)) onChange(iso, format(st, 'yyyy-MM-dd'))
      else onChange(format(st, 'yyyy-MM-dd'), iso)
      setPickingEnd(false); setHover(null); setOpen(false)
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
      for (let i = 0; i < 7; i++) { week.push(new Date(d)); d.setDate(d.getDate() + 1) }
      weeks.push(week)
    }
    return weeks
  }

  function renderCal(month: Date) {
    const weeks = buildWeeks(month)
    const range = getRange()
    const todayIso = format(new Date(), 'yyyy-MM-dd')

    return (
      <div style={{ width: CAL_W }}>
        {/* Month title */}
        <div className="text-center text-[13px] font-semibold text-surface-800 dark:text-surface-100 pb-2 select-none">
          {format(month, 'MMMM yyyy')}
        </div>
        {/* Weekday header */}
        <div className="grid grid-cols-7" style={{ height: 28 }}>
          {DAYS.map(d => (
            <div key={d} className="flex items-center justify-center text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase select-none">{d}</div>
          ))}
        </div>
        {/* Day grid */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7" style={{ height: CELL }}>
            {week.map((day, di) => {
              const iso = format(day, 'yyyy-MM-dd')
              const inMonth = day.getMonth() === month.getMonth()
              const isToday = iso === todayIso
              const inR = range ? isWithinInterval(day, { start: range.rs, end: range.re }) : false
              const isS = range ? isSameDay(day, range.rs) : false
              const isE = range ? isSameDay(day, range.re) : false

              // Background band
              let bgClass = ''
              if (inR && !(isS && isE)) {
                bgClass = 'bg-brand-50'
                if (isS) bgClass += ' rounded-l-full'
                if (isE) bgClass += ' rounded-r-full'
              }

              // Inner button
              let btnClass = 'w-8 h-8 flex items-center justify-center rounded-full text-[13px] transition-colors duration-100 '
              if (isS || isE) {
                btnClass += 'bg-brand-600 text-white font-semibold '
              } else if (inR) {
                btnClass += inMonth ? 'text-brand-700 font-medium ' : 'text-brand-400 '
              } else if (isToday && inMonth) {
                btnClass += 'border border-brand-400 text-brand-700 font-semibold '
              } else if (!inMonth) {
                btnClass += 'text-surface-300 '
              } else {
                btnClass += 'text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 '
              }

              return (
                <div key={di} className={`flex items-center justify-center ${bgClass}`}>
                  <button
                    type="button"
                    className={btnClass}
                    onClick={() => handleClick(iso)}
                    onMouseEnter={() => setHover(iso)}
                  >
                    {format(day, 'd')}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const display = `${format(vs, 'MMM d, yyyy')}  –  ${format(ve, 'MMM d, yyyy')}`

  return (
    <div ref={wrapRef} className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        className={'input flex items-center gap-2 px-3 ' + className}
        onClick={() => setOpen(o => !o)}
      >
        <Calendar className="w-4 h-4 text-surface-400 dark:text-surface-500 shrink-0" />
        <span className="text-sm text-surface-900 dark:text-surface-50 tabular-nums whitespace-nowrap">{display}</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          onMouseLeave={() => { if (!pickingEnd) setHover(null) }}
          style={{
            position: 'fixed',
            zIndex: 200,
            top: pos.flip ? undefined : pos.top,
            bottom: pos.flip ? window.innerHeight - pos.top : undefined,
            left: pos.left,
            width: window.innerWidth < 640 ? 'calc(100vw - 16px)' : POPUP_W,
          }}
          className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl"
        >
          {/* Mode toggle bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
            <div className="segmented">
              <button type="button" onClick={() => { setMode('week'); setPickingEnd(false) }}
                className={`segmented-item text-[11px] ${mode === 'week' ? 'segmented-item-active' : ''}`}>
                Weekly
              </button>
              <button type="button" onClick={() => { setMode('custom'); setPickingEnd(false) }}
                className={`segmented-item text-[11px] ${mode === 'custom' ? 'segmented-item-active' : ''}`}>
                Custom
              </button>
            </div>
            <span className="text-[11px] text-surface-400 dark:text-surface-500 hidden sm:inline">
              {mode === 'week' ? 'Click a day → selects Sun – Sat' : pickingEnd ? 'Click end date' : 'Click start date'}
            </span>
          </div>

          {/* Calendars */}
          <div className="flex items-start justify-between px-3 py-3 overflow-x-auto">
            <button type="button" onClick={() => setLeftMonth(m => subMonths(m, 1))}
              className="p-1 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:text-surface-200 mt-0.5 shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex gap-8 mx-auto">
              {renderCal(leftMonth)}
              <div className="hidden sm:block">
                {renderCal(rightMonth)}
              </div>
            </div>

            <button type="button" onClick={() => setLeftMonth(m => addMonths(m, 1))}
              className="p-1 rounded-lg text-surface-400 dark:text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 dark:bg-surface-800 hover:text-surface-700 dark:text-surface-200 mt-0.5 shrink-0">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Footer shortcuts */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-surface-100 dark:border-surface-800 bg-surface-50/60">
            <div className="flex items-center gap-2.5">
              <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => {
                  const n = new Date()
                  onChange(format(startOfWeek(n, { weekStartsOn: 0 }), 'yyyy-MM-dd'), format(endOfWeek(n, { weekStartsOn: 0 }), 'yyyy-MM-dd'))
                  setLeftMonth(startOfMonth(n)); setOpen(false)
                }}>This week</button>
              <span className="text-surface-200">|</span>
              <button type="button" className="text-xs font-medium text-surface-500 dark:text-surface-400 dark:text-surface-500 hover:text-surface-700 dark:text-surface-200"
                onClick={() => {
                  const p = new Date(); p.setDate(p.getDate() - 7)
                  onChange(format(startOfWeek(p, { weekStartsOn: 0 }), 'yyyy-MM-dd'), format(endOfWeek(p, { weekStartsOn: 0 }), 'yyyy-MM-dd'))
                  setLeftMonth(startOfMonth(startOfWeek(p, { weekStartsOn: 0 }))); setOpen(false)
                }}>Last week</button>
            </div>
            <button type="button" className="text-xs font-medium text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:text-surface-300"
              onClick={() => { setOpen(false); setPickingEnd(false); setHover(null) }}>
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
