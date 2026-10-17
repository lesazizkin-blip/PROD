import { BOX_STATUSES, type BoxStatus } from '../api/types'
import { BOX_STATUS_HINTS, STATUS_LABELS } from '../ui/format'
import type { StatusOption } from './StatusPickerModal'

export const nextBoxStatus = (current: BoxStatus): BoxStatus | null => BOX_STATUSES[BOX_STATUSES.indexOf(current) + 1] ?? null
export const canAdvanceBox = (current: BoxStatus, target: BoxStatus) => nextBoxStatus(current) === target
/** Назад - на любой более ранний этап, без причины (так же разрешает сервер). */
export const isEarlierBox = (current: BoxStatus, target: BoxStatus) => BOX_STATUSES.indexOf(target) < BOX_STATUSES.indexOf(current)

/** Вперёд - только следующий этап; назад - любой прошлый, одним нажатием. */
export const boxStatusOptions = (current: BoxStatus): StatusOption<BoxStatus>[] =>
  BOX_STATUSES.map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
    hint: isEarlierBox(current, s) ? 'Вернуть коробку на этот этап.' : s === current || canAdvanceBox(current, s) ? BOX_STATUS_HINTS[s] : `Сначала отметьте «${STATUS_LABELS[nextBoxStatus(current) ?? current]}».`,
    badge: `st-${s}`,
    disabled: s !== current && !canAdvanceBox(current, s) && !isEarlierBox(current, s),
  }))
