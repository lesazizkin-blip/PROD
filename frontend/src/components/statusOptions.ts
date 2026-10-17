import { BOX_STATUSES, type BoxStatus } from '../api/types'
import { BOX_STATUS_HINTS, STATUS_LABELS } from '../ui/format'
import type { StatusOption } from './StatusPickerModal'

/** Пять статусов коробки для окна выбора; extra дописывает вариантам своё (например, счётчики комнаты). */
export const boxStatusOptions = (extra?: (s: BoxStatus) => Partial<StatusOption<BoxStatus>>): StatusOption<BoxStatus>[] =>
  BOX_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], hint: BOX_STATUS_HINTS[s], badge: `st-${s}`, ...extra?.(s) }))
