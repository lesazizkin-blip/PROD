import type { BoxStatus } from '../api/types'
import { STATUS_LABELS } from './format'

/** Цветная метка статуса коробки: цвет один и тот же на всех экранах (см. .st-* в styles.css). */
export default function StatusBadge({ status }: { status: BoxStatus }) {
  return <span className={`badge st-${status}`}>{STATUS_LABELS[status]}</span>
}
