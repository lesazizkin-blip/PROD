import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UNAUTHORIZED_EVENT } from '../api/client'
import { api } from '../api/endpoints'
import type { Credentials, User } from '../api/types'

interface AuthValue {
  /** undefined - ещё проверяем cookie, null - не вошёл */
  user: User | null | undefined
  login: (c: Credentials) => Promise<void>
  register: (c: Credentials) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    api.me().then((u) => !cancelled && setUser(u)).catch(() => !cancelled && setUser(null))
    const onUnauthorized = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      login: async (c) => setUser(await api.login(c)),
      register: async (c) => setUser(await api.register(c)),
      logout,
    }),
    [user, logout],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth вызван вне AuthProvider')
  return v
}
