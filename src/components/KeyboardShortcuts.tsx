import { useEffect, useState } from 'react'
import { Command, X } from 'lucide-react'

/**
 * Global app-wide keyboard shortcuts.
 *  - "/"       focus first visible search input
 *  - "n"       focus a button labeled "New …" (primary action) on the page
 *  - "?"       toggle this help overlay
 *  - "Escape"  close the help overlay (when open)
 *
 * Single-character shortcuts are ignored when the user is currently typing
 * in an input/textarea/contenteditable, so they never interfere with text entry.
 */
export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    function isTyping(target: EventTarget | null): boolean {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (el.isContentEditable) return true
      return false
    }

    function focusSearch() {
      // Prefer an input with placeholder containing "search" (case-insensitive).
      const candidates = Array.from(document.querySelectorAll('input')).filter((i) => {
        if (i.type === 'hidden') return false
        if (i.disabled) return false
        const ph = (i.placeholder || '').toLowerCase()
        return ph.includes('search') || ph.includes('find')
      })
      if (candidates.length > 0) {
        candidates[0].focus()
        candidates[0].select()
        return true
      }
      return false
    }

    function clickPrimaryNew() {
      // Look for a button whose text starts with "New " or is exactly "New" or "Create".
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[]
      for (const b of buttons) {
        if (b.disabled) continue
        const txt = (b.textContent || '').trim()
        if (/^new\b/i.test(txt) || /^create\b/i.test(txt) || /^add\b/i.test(txt)) {
          b.click()
          return true
        }
      }
      return false
    }

    function handleKey(e: KeyboardEvent) {
      // Don't hijack when modifier keys are involved (cmd+f, ctrl+l, etc).
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape' && showHelp) {
        e.preventDefault()
        setShowHelp(false)
        return
      }

      if (isTyping(e.target)) return

      if (e.key === '/') {
        if (focusSearch()) e.preventDefault()
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((s) => !s)
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        if (clickPrimaryNew()) e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showHelp])

  if (!showHelp) return null

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-surface-900/40 backdrop-blur-[2px]"
        onClick={() => setShowHelp(false)}
        aria-label="Close shortcuts"
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-surface-200 bg-white shadow-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100">
          <div className="flex items-center gap-2">
            <Command className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-surface-900">Keyboard shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className="btn-icon text-surface-400 hover:text-surface-700 hover:bg-surface-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="p-5 space-y-3">
          <ShortcutRow keys={['/']} description="Focus search" />
          <ShortcutRow keys={['n']} description="Trigger primary action (New / Create / Add)" />
          <ShortcutRow keys={['?']} description="Show this help" />
          <ShortcutRow keys={['Esc']} description="Close modals / overlays" />
        </ul>
        <p className="px-5 pb-4 text-[11px] text-surface-400">
          Shortcuts are ignored while you're typing in a field.
        </p>
      </div>
    </div>
  )
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span className="text-sm text-surface-700">{description}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k) => (
          <kbd
            key={k}
            className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-2 rounded-md border border-surface-200 bg-surface-50 text-[11px] font-mono font-medium text-surface-700 shadow-[0_1px_0_rgb(0_0_0_/_0.04)]"
          >
            {k}
          </kbd>
        ))}
      </span>
    </li>
  )
}
