import { type FormEvent, useState } from 'react'
import { ApiError, api, tokenStore } from '../api'
import type { User } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthPage({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!EMAIL_RE.test(email)) e.email = 'Введите корректный email'
    if (mode === 'register' && fullName.trim().length < 2) e.full_name = 'Минимум 2 символа'
    if (password.length < (mode === 'register' ? 8 : 1))
      e.password = mode === 'register' ? 'Минимум 8 символов' : 'Введите пароль'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setFormError('')
    if (!validate()) return
    setBusy(true)
    try {
      const res =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, full_name: fullName.trim(), password })
      tokenStore.set(res.access_token)
      onAuth(res.user)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])))
      } else setFormError('Что-то пошло не так')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <h1>{mode === 'login' ? 'Вход' : 'Регистрация'}</h1>

        {mode === 'register' && (
          <label>
            Имя и фамилия
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
            {errors.full_name && <span className="error">{errors.full_name}</span>}
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          {errors.email && <span className="error">{errors.email}</span>}
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {errors.password && <span className="error">{errors.password}</span>}
        </label>

        {formError && <div className="alert">{formError}</div>}
        <button className="primary" disabled={busy}>
          {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setErrors({})
            setFormError('')
          }}
        >
          {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </main>
  )
}
