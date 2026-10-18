import { useState, type ClipboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../state/AuthContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'

// Из поля пароля ничего не копируется и не вырезается: пароль не уходит в буфер обмена
const blockCopy = (e: ClipboardEvent<HTMLInputElement>) => e.preventDefault()

type Field = 'username' | 'password' | 'repeat'
type FieldErrors = Partial<Record<Field, string>>

// То же правило, что в backend/app/schemas.py (_username): регистр сервер приводит сам
const LOGIN_RE = /^[a-z0-9_.-]{3,40}$/i
const LOGIN_RULE = 'Логин: 3–40 символов, латиница, цифры, точка, дефис или подчёркивание'
const PASSWORD_RULE = 'Пароль: от 8 до 128 символов'

/** Какие поля подсветить по ответу сервера. 422 приходит с полями, 409 (логин занят) и 401 (вход) - без них. */
function fieldErrorsOf(e: unknown, isRegister: boolean): FieldErrors {
  if (!(e instanceof ApiError)) return {}
  const out: FieldErrors = {}
  for (const [field, message] of Object.entries(e.fieldErrors)) {
    if (field !== 'username' && field !== 'password') continue
    const text = message.replace(/^Value error, /, '')
    // проверка длины у pydantic по-английски: подставляем своё правило
    out[field] = /[а-яё]/i.test(text) ? text : field === 'username' ? LOGIN_RULE : PASSWORD_RULE
  }
  if (e.status === 409) out.username = e.message
  if (e.status === 401 && !isRegister) {
    out.username = ''
    out.password = '' // «неверный логин или пароль»: подсвечиваем оба, текст один - в плашке
  }
  return out
}

/** Вход и регистрация. Режим можно открыть ссылкой /auth?mode=register. Для ссылок из QR и приглашений
 *  показывается вместо страницы, адрес не меняется: после входа откроется та же коробка или приглашение. */
export default function AuthPage({ note }: { note?: string }) {
  const { login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [serverFields, setServerFields] = useState<FieldErrors>({})
  const { busy, error, setError, submit } = useAction()
  const isRegister = mode === 'register'
  const trimmed = username.trim()
  // подсказки до отправки: формат логина и совпадение паролей проверяем сразу
  const badLogin = isRegister && trimmed !== '' && !LOGIN_RE.test(trimmed)
  const mismatch = isRegister && repeat !== '' && repeat !== password
  const invalid = trimmed.length < 3 || badLogin || password.length < (isRegister ? 8 : 1) || (isRegister && repeat !== password)

  const fieldErrors: FieldErrors = {
    ...serverFields,
    ...(badLogin ? { username: LOGIN_RULE } : {}),
    ...(mismatch ? { repeat: 'Пароли не совпадают' } : {}),
  }
  const shown = new Set(Object.values(fieldErrors).filter(Boolean))
  // общая плашка не повторяет текст, который уже стоит под полем
  const alert = error && !shown.has(error) ? error : null

  const switchTo = (m: 'login' | 'register') => {
    setMode(m)
    setRepeat('')
    setError(null)
    setServerFields({})
  }
  const edit = (field: Field, set: (v: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value)
    if (field in serverFields) {
      setServerFields((prev) => {
        const rest = { ...prev }
        delete rest[field]
        return rest
      })
    }
    if (field !== 'repeat' && error) setError(null)
  }
  const enter = async () => {
    const creds = { username: trimmed, password }
    try {
      await (isRegister ? register(creds) : login(creds))
    } catch (e) {
      setServerFields(fieldErrorsOf(e, isRegister))
      throw e
    }
  }
  const describe = (field: Field, extra?: string) =>
    [fieldErrors[field] ? `auth-${field}-error` : null, extra].filter(Boolean).join(' ') || undefined
  const fieldError = (field: Field) =>
    fieldErrors[field] ? <p id={`auth-${field}-error`} className="error-text small" role="status">{fieldErrors[field]}</p> : null

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
          <input value={username} onChange={edit('username', setUsername)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={40} data-autofocus aria-invalid={'username' in fieldErrors} aria-describedby={describe('username')} />
        </label>
        {fieldError('username')}
        <label>
          Пароль
          <input type="password" value={password} onChange={edit('password', setPassword)} onCopy={blockCopy} onCut={blockCopy} autoComplete={isRegister ? 'new-password' : 'current-password'} maxLength={128} aria-invalid={'password' in fieldErrors} aria-describedby={describe('password', isRegister ? 'auth-rules' : undefined)} />
        </label>
        {fieldError('password')}
        {isRegister ? (
          <label>
            Повторите пароль
            <input type="password" value={repeat} onChange={edit('repeat', setRepeat)} onCopy={blockCopy} onCut={blockCopy} onPaste={blockCopy} autoComplete="new-password" maxLength={128} aria-invalid={mismatch} aria-describedby={describe('repeat')} />
          </label>
        ) : null}
        {fieldError('repeat')}
        {isRegister ? <p id="auth-rules" className="muted small">Пароль не короче 8 символов. Логин: латиница, цифры, точка, дефис.</p> : null}
        <ErrorAlert message={alert} />
        <button className="primary" type="submit" disabled={busy || invalid}>{isRegister ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
    </div>
  )
}
