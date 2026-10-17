import { BOX_STATUSES, type BoxStatus } from '../api/types'
import { BOX_STATUS_HINTS, STATUS_LABELS } from '../ui/format'
import type { StatusOption } from './StatusPickerModal'

export const nextBoxStatus = (current: BoxStatus): BoxStatus | null => BOX_STATUSES[BOX_STATUSES.indexOf(current) + 1] ?? null
export const canAdvanceBox = (current: BoxStatus, target: BoxStatus) => nextBoxStatus(current) === target

/** Ordinary actions follow the move; correction is a separate, explicit flow. */
export const boxStatusOptions = (current: BoxStatus): StatusOption<BoxStatus>[] =>
  BOX_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], hint: s === current || canAdvanceBox(current, s) ? BOX_STATUS_HINTS[s] : `Сначала отметьте «${STATUS_LABELS[nextBoxStatus(current) ?? current]}». Ошибочную отметку можно исправить отдельно.`, badge: `st-${s}`, disabled: s !== current && !canAdvanceBox(current, s) }))
