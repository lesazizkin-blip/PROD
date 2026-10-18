import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
type Theme = 'light' | 'dark'
const STORAGE_KEY = 'movermate.theme.v1'
const QUERY = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* A browser can deny storage; the theme still works for this visit. */ }
  return 'system'
}

const Context = createContext<{ preference: ThemePreference; theme: Theme; setPreference: (value: ThemePreference) => void } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.(QUERY).matches ?? false)
  const theme: Theme = preference === 'system' ? systemDark ? 'dark' : 'light' : preference
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171a17' : '#f4f0e7')
  }, [theme])
  useEffect(() => {
    const media = window.matchMedia?.(QUERY)
    const systemChanged = () => setSystemDark(media?.matches ?? false)
    const storageChanged = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setPreferenceState(readPreference())
    }
    systemChanged()
    media?.addEventListener?.('change', systemChanged)
    window.addEventListener('storage', storageChanged)
    return () => {
      media?.removeEventListener?.('change', systemChanged)
      window.removeEventListener('storage', storageChanged)
    }
  }, [])
  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value)
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* Keep the in-memory choice. */ }
  }, [])
  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme, setPreference])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(Context)
  if (!context) throw new Error('ThemeProvider is required')
  return context
}
