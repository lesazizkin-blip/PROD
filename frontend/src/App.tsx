import { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from './api'
import AuthPage from './components/AuthPage'
import ItemsPage from './components/ItemsPage'
import type { User } from './types'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(!!tokenStore.get())
  const [notice, setNotice] = useState('')

  const logout = useCallback((message = '') => {
    tokenStore.clear()
    setUser(null)
    setNotice(message)
  }, [])

  useEffect(() => {
    // Токен протух посреди работы: возвращаем на вход и объясняем почему
    setUnauthorizedHandler(() => logout('Сессия истекла. Войдите снова.'))
    if (!tokenStore.get()) return
    api
      .me()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setChecking(false))
  }, [logout])

  if (checking) return <div className="center muted">Загрузка…</div>
  if (!user)
    return (
      <AuthPage
        notice={notice}
        onAuth={(u) => {
          setNotice('')
          setUser(u)
        }}
      />
    )
  return <ItemsPage user={user} onLogout={() => logout()} />
}
