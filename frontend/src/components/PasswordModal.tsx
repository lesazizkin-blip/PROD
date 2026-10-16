import { useState, type FormEvent } from 'react'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import Modal from './Modal'

/** Смена пароля: все остальные входы (например, на потерянном телефоне) закрываются. */
export default function PasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setDone(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Сменить пароль" onClose={onClose} dirty={!done && (current !== '' || next !== '')}>
      {done ? (
        <div className="stack">
          <p role="status">Пароль изменён. На других устройствах нужно войти заново.</p>
          <button className="primary" onClick={onClose}>Готово</button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label>
            Текущий пароль
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" data-autofocus />
          </label>
          <label>
            Новый пароль
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={128} aria-describedby="pw-rule" />
          </label>
          <p id="pw-rule" className="muted small">Не короче 8 символов. Все остальные входы будут закрыты.</p>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <button className="primary" type="submit" disabled={busy || !current || next.length < 8}>Сменить пароль</button>
        </form>
      )}
    </Modal>
  )
}
