import Modal from './Modal'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import type { ReactNode } from 'react'

export interface StatusOption<T extends string> {
  value: T
  label: string
  /** Подпись под названием: что значит статус или почему он сейчас недоступен */
  hint?: string
  /** Класс цветной метки (st-* для коробок, it-* для вещей) */
  badge: string
  disabled?: boolean
}

interface Props<T extends string> {
  title: string
  /** Текущий статус: отмечен и недоступен */
  current?: T
  options: StatusOption<T>[]
  /** Сохранить выбор; окно закроется после успеха, ошибка останется в окне */
  onPick: (value: T) => Promise<unknown>
  onClose: () => void
  footer?: ReactNode
}

// Всплывающее окно выбора статуса: список вариантов, текущий отмечен, недоступные затемнены с объяснением.
export default function StatusPickerModal<T extends string>({ title, current, options, onPick, onClose, footer }: Props<T>) {
  const { busy, error, run } = useAction(onClose)
  return (
    <Modal title={title} onClose={onClose}>
      <div className="choice-list">
        {options.map((o) => {
          const isCurrent = o.value === current
          return (
            <button
              key={o.value}
              className={`choice${isCurrent ? ' current' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              disabled={busy || isCurrent || o.disabled}
              onClick={() => run(() => onPick(o.value))}
            >
              <span className={`badge ${o.badge}`}>{o.label}</span>
              <span className="sub">{isCurrent ? 'Сейчас' : o.hint}</span>
            </button>
          )
        })}
      </div>
      <ErrorAlert message={error} />
      {footer}
    </Modal>
  )
}
