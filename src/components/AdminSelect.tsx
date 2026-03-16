import { useState, useRef, useEffect, type ReactNode } from 'react'

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
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const baseClass =
    'relative inline-block text-sm ' + (disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer')

  const buttonClass =
    'input w-full rounded-xl min-h-[2.75rem] flex items-center justify-between px-3 py-2 ' +
    'transition-colors duration-150 hover:bg-surface-50 focus:outline-none focus:ring-2 ' +
    'focus:ring-brand-200 focus:border-brand-400 ' +
    (disabled ? 'pointer-events-none ' : '') +
    className

  return (
    <div ref={wrapperRef} className={baseClass}>
      <button
        type="button"
        className={buttonClass}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="truncate text-left min-w-0 flex-1">
          {selected ? selected.label : <span className="text-surface-400">{placeholder}</span>}
        </span>
        <span
          className={
            'ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-surface-400 transition-transform duration-150 ' +
            (open ? 'rotate-180' : '')
          }
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-surface-200 bg-white shadow-lg max-h-60 overflow-auto">
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
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-surface-700 hover:bg-surface-50 hover:text-surface-900')
                    }
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isActive && (
                      <span className="ml-2 text-brand-500">
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 111.414-1.42L8.75 11.54l6.543-6.54a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

