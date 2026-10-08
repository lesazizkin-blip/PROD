import { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api'
import AuthPage from './components/AuthPage'
import ItemsPage from './components/ItemsPage'
import type { User } from './types'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(!!tokenStore.get())

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStore.get()) return
    api
      .me()
      .then(setUser)
      .catch(logout)
      .finally(() => setChecking(false))
  }, [logout])

  if (checking) return <div className="center muted">Загрузка…</div>
  if (!user) return <AuthPage onAuth={setUser} />
  return <ItemsPage user={user} onLogout={logout} />
}
