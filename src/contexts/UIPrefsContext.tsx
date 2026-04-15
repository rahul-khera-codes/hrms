import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type Density = 'comfortable' | 'compact'

interface UIPrefsContextValue {
  density: Density
  setDensity: (d: Density) => void
  toggleDensity: () => void
}

const STORAGE_KEY = 'harmony.ui.density'
const Ctx = createContext<UIPrefsContextValue | null>(null)

function applyDensityToDocument(density: Density) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.density = density
}

export function UIPrefsProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === 'undefined') return 'comfortable'
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'compact' ? 'compact' : 'comfortable'
  })

  useEffect(() => {
    applyDensityToDocument(density)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, density)
  }, [density])

  const setDensity = useCallback((d: Density) => setDensityState(d), [])
  const toggleDensity = useCallback(
    () => setDensityState((prev) => (prev === 'comfortable' ? 'compact' : 'comfortable')),
    []
  )

  return <Ctx.Provider value={{ density, setDensity, toggleDensity }}>{children}</Ctx.Provider>
}

export function useUIPrefs(): UIPrefsContextValue {
  const v = useContext(Ctx)
  if (!v) {
    return {
      density: 'comfortable',
      setDensity: () => {},
      toggleDensity: () => {},
    }
  }
  return v
}
