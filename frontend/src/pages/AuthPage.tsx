import { useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { useAuth } from '../state/AuthContext'

/** Вход и регистрация. Показывается вместо любой страницы, пока пользователь не вошёл; адрес не меняется,
 *  поэтому после входа откроется та же страница (например, коробка по QR или приглашение). */
export default function AuthPage({ note }: { note?: string }) {
  const { login, register, demo } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isRegister = mode === 'register'
  const invalid = username.trim().length < 3 || password.length < (isRegister ? 8 : 1)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (invalid) return
    const creds = { username: username.trim(), password }
    void run(() => (isRegister ? register(creds) : login(creds)))
  }

  return (
    <div className="auth">
      <div className="auth__brand">MoverMate</div>
      <p className="muted auth__tagline">Переезд без хаоса: план, коробки и поиск любой вещи</p>
      {note ? <div className="banner" role="status">{note}</div> : null}
      <form className="card stack" onSubmit={submit}>
        <div className="segmented" role="tablist" aria-label="Вход или регистрация">
          <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'on' : ''} onClick={() => { setMode('login'); setError(null) }}>Вход</button>
          <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'on' : ''} onClick={() => { setMode('register'); setError(null) }}>Регистрация</button>
        </div>
        <label>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} data-autofocus />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} maxLength={128} aria-describedby={isRegister ? 'auth-rules' : undefined} />
        </label>
        {isRegister ? <p id="auth-rules" className="muted small">Пароль не короче 8 символов. Логин: латиница, цифры, точка, дефис.</p> : null}
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || invalid}>{isRegister ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      <button className="link auth__demo" type="button" disabled={busy} onClick={() => void run(demo)}>
        Посмотреть демо без регистрации
      </button>
      <p className="muted small auth__privacy">Мы храним только логин и хэш пароля: ни почты, ни телефона.</p>
    </div>
  )
}
