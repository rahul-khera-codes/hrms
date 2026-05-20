import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Check } from 'lucide-react'

interface AdminSelectOption {
  value: string
  label: ReactNode
}

interface AdminSelectProps {
  value: string
  onChange: (value: string) => void
  options: AdminSelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function AdminSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled,
  className = '',
}: AdminSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number
    left: number
    width: number
    placement: 'bottom' | 'top'
    maxHeight: number
  }>({ top: 0, left: 0, width: 0, placement: 'bottom', maxHeight: 240 })
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      // Ignore clicks inside the wrapper OR inside the portaled dropdown
      if (wrapperRef.current && wrapperRef.current.contains(target)) return
      if (dropdownRef.current && dropdownRef.current.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Compute position when opening or on scroll/resize while open
  useEffect(() => {
    if (!open || !buttonRef.current) return

    function computePosition() {
      if (!buttonRef.current) return
      const rect = buttonRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const desiredHeight = 240
      const gap = 4

      // Decide placement: default bottom, flip to top if bottom is cramped AND top has more room
      const useTop = spaceBelow < 180 && spaceAbove > spaceBelow
      const availableSpace = useTop ? spaceAbove - gap - 8 : spaceBelow - gap - 8
      const maxHeight = Math.min(desiredHeight, Math.max(120, availableSpace))

      setDropdownPosition({
        top: useTop ? rect.top + window.scrollY - gap : rect.bottom + window.scrollY + gap,
        left: rect.left + window.scrollX,
        width: rect.width,
        placement: useTop ? 'top' : 'bottom',
        maxHeight,
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

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open])

  const baseClass =
    'relative inline-block text-sm ' + (disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')

  const buttonClass =
    'input flex items-center justify-between px-3 ' +
    'transition-colors duration-150 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900' +
    (disabled ? 'pointer-events-none ' : '') +
    className

  return (
    <div ref={wrapperRef} className={baseClass}>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClass}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="truncate text-left min-w-0 flex-1">
          {selected ? selected.label : <span className="text-surface-400 dark:text-surface-500 dark:text-surface-400">{placeholder}</span>}
        </span>
        <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-surface-400 dark:text-surface-500 dark:text-surface-400 transition-colors">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && !disabled && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-xl overflow-auto"
          style={{
            top: dropdownPosition.placement === 'bottom' ? `${dropdownPosition.top}px` : undefined,
            bottom: dropdownPosition.placement === 'top'
              ? `${window.innerHeight - dropdownPosition.top}px`
              : undefined,
            left: `${dropdownPosition.left}px`,
            minWidth: `${dropdownPosition.width}px`,
            maxWidth: `max(${dropdownPosition.width}px, 200px)`,
            maxHeight: `${dropdownPosition.maxHeight}px`,
          }}
        >
          <ul className="py-1 text-sm" role="listbox">
            {options.map((opt) => {
              const isActive = opt.value === value
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={
                      'w-full text-left px-3 py-2 flex items-center justify-between transition-colors duration-150 ' +
                      (isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-800 dark:bg-surface-900 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-50')
                    }
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isActive && (
                      <span className="ml-2 text-brand-500 dark:text-brand-300 shrink-0">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  )
}
