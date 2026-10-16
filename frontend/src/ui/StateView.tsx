import type { ReactNode } from 'react'

interface Props {
  loading: boolean
  error: string | null
  empty?: boolean
  emptyText?: string
  emptyIcon?: string
  onRetry?: () => void
  children: ReactNode
}

/** Единые состояния экрана: загрузка, ошибка с повтором, пусто. Используем на каждом экране со списком. */
export default function StateView({ loading, error, empty, emptyText = 'Пока ничего нет', emptyIcon = '📭', onRetry, children }: Props) {
  if (loading) return <div className="state" role="status" aria-live="polite"><span className="spinner" aria-hidden /> Загрузка…</div>
  if (error)
    return (
      <div className="state" role="alert">
        <div className="state-icon" aria-hidden>⚠️</div>
        <p>{error}</p>
        {onRetry ? <button onClick={onRetry}>Повторить</button> : null}
      </div>
    )
  if (empty)
    return (
      <div className="state">
        <div className="state-icon" aria-hidden>{emptyIcon}</div>
        <p>{emptyText}</p>
      </div>
    )
  return <>{children}</>
}
