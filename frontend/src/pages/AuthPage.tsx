import { useState, type ClipboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'

// Из поля пароля ничего не копируется и не вырезается: пароль не уходит в буфер обмена
const blockCopy = (e: ClipboardEvent<HTMLInputElement>) => e.preventDefault()

/** Вход и регистрация. Режим можно открыть ссылкой /auth?mode=register. Для ссылок из QR и приглашений
 *  показывается вместо страницы, адрес не меняется: после входа откроется та же коробка или приглашение. */
export default function AuthPage({ note }: { note?: string }) {
  const { login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const { busy, error, setError, submit } = useAction()
  const isRegister = mode === 'register'
  const mismatch = isRegister && repeat !== '' && repeat !== password
  const invalid = username.trim().length < 3 || password.length < (isRegister ? 8 : 1) || (isRegister && repeat !== password)

  const switchTo = (m: 'login' | 'register') => {
    setMode(m)
    setRepeat('')
    setError(null)
  }
  const enter = () => {
    const creds = { username: username.trim(), password }
    return isRegister ? register(creds) : login(creds)
  }

  return (
    <div className="auth">
      <div className="auth__brand"><img src="/assets/box-mark.svg" width="36" height="36" alt="" />MoverMate</div>
      <p className="muted auth__tagline">Переезд без хаоса: план, коробки и поиск любой вещи</p>
      {note ? <div className="banner" role="status">{note}</div> : null}
      <form className="card stack" onSubmit={submit(enter)}>
        <div className="segmented" role="tablist" aria-label="Вход или регистрация">
          <button type="button" role="tab" aria-selected={!isRegister} className={!isRegister ? 'on' : ''} onClick={() => switchTo('login')}>Вход</button>
          <button type="button" role="tab" aria-selected={isRegister} className={isRegister ? 'on' : ''} onClick={() => switchTo('register')}>Регистрация</button>
        </div>
        <label>
          Логин
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} data-autofocus />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onCopy={blockCopy} onCut={blockCopy} autoComplete={isRegister ? 'new-password' : 'current-password'} maxLength={128} aria-describedby={isRegister ? 'auth-rules' : undefined} />
        </label>
        {isRegister ? (
          <label>
            Повторите пароль
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} onCopy={blockCopy} onCut={blockCopy} onPaste={blockCopy} autoComplete="new-password" maxLength={128} aria-invalid={mismatch} />
          </label>
        ) : null}
        {mismatch ? <p className="error-text small" role="status">Пароли не совпадают</p> : null}
        {isRegister ? <p id="auth-rules" className="muted small">Пароль не короче 8 символов. Логин: латиница, цифры, точка, дефис.</p> : null}
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || invalid}>{isRegister ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
    </div>
  )
}
