import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
  durationMs: number
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
  warning: (message: string, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLE: Record<ToastVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
}

const VARIANT_BAR: Record<ToastVariant, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
}

const VARIANT_ICON: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  error: <AlertCircle className="w-4 h-4 text-red-600" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-600" />,
  info: <Info className="w-4 h-4 text-sky-600" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counterRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message: string, variant: ToastVariant = 'info', durationMs: number = 3500) => {
    const id = ++counterRef.current
    const next: Toast = { id, message, variant, durationMs }
    setToasts((prev) => {
      // Cap visible toasts at 4; drop the oldest when over limit.
      const trimmed = prev.length >= 4 ? prev.slice(prev.length - 3) : prev
      return [...trimmed, next]
    })
  }, [])

  const value: ToastContextValue = {
    show,
    success: (m, d) => show(m, 'success', d),
    error: (m, d) => show(m, 'error', d ?? 5000),
    warning: (m, d) => show(m, 'warning', d),
    info: (m, d) => show(m, 'info', d),
    dismiss,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed top-4 right-4 z-[300] flex flex-col gap-2 pointer-events-none w-[min(22rem,calc(100vw-2rem))]"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (toast.durationMs <= 0) return
    const id = window.setTimeout(() => onDismiss(toast.id), toast.durationMs)
    return () => window.clearTimeout(id)
  }, [toast.id, toast.durationMs, onDismiss])

  return (
    <div
      role="status"
      className={`relative pointer-events-auto rounded-xl border shadow-md overflow-hidden ${VARIANT_STYLE[toast.variant]} animate-in slide-in-from-right-2 fade-in duration-200`}
    >
      <div className="flex items-start gap-2.5 p-3 pr-8">
        <span className="shrink-0 mt-0.5">{VARIANT_ICON[toast.variant]}</span>
        <p className="text-sm leading-snug flex-1 break-words">{toast.message}</p>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="absolute top-1.5 right-1.5 p-1 rounded-md text-current/60 hover:bg-black/5 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {toast.durationMs > 0 && (
        <span
          className={`absolute bottom-0 left-0 h-0.5 ${VARIANT_BAR[toast.variant]} animate-toast-bar`}
          style={{ animationDuration: `${toast.durationMs}ms` }}
        />
      )}
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    // Fallback: log to console if Provider wasn't mounted (shouldn't happen in app).
    return {
      show: (m, v) => console.warn('[Toast no provider]', v, m),
      success: (m) => console.warn('[Toast no provider] success', m),
      error: (m) => console.warn('[Toast no provider] error', m),
      warning: (m) => console.warn('[Toast no provider] warning', m),
      info: (m) => console.warn('[Toast no provider] info', m),
      dismiss: () => {},
    }
  }
  return ctx
}
