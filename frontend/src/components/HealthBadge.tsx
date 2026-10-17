import { useEffect, useState } from 'react'
import { api } from '../api/endpoints'

type State = 'checking' | 'ok' | 'down'
const LABELS: Record<State, string> = { checking: 'Проверка', ok: 'Онлайн', down: 'Нет связи' }

/** Индикатор здоровья сервиса (раздел 8 ТЗ): опрашивает /api/health раз в минуту. */
export default function HealthBadge() {
  const [state, setState] = useState<State>('checking')
  useEffect(() => {
    let cancelled = false
    const check = () =>
      api.health()
        .then((h) => !cancelled && setState(h.status === 'ok' && h.db === 'ok' ? 'ok' : 'down'))
        .catch(() => !cancelled && setState('down'))
    void check()
    const timer = window.setInterval(check, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])
  return (
    <span className={`health health--${state}`} role="status" title="Состояние сервера и базы данных">
      <span className="health__dot" aria-hidden />
      {LABELS[state]}
    </span>
  )
}
