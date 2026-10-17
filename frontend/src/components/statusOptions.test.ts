import { describe, expect, it } from 'vitest'
import { BOX_STATUSES } from '../api/types'
import { boxStatusOptions, canAdvanceBox } from './statusOptions'

describe('обычные этапы коробки', () => {
  it('не разрешает распаковать недоставленную коробку или пропустить погрузку', () => {
    expect(canAdvanceBox('packing', 'unpacked')).toBe(false)
    expect(canAdvanceBox('packed', 'delivered')).toBe(false)
    expect(canAdvanceBox('loaded', 'unpacked')).toBe(false)
    expect(boxStatusOptions('packing').find(o => o.value === 'unpacked')?.disabled).toBe(true)
  })
  it('разрешает только следующий этап, включая распаковку после доставки', () => {
    for (let i = 0; i < BOX_STATUSES.length; i++) {
      expect(BOX_STATUSES.filter(to => canAdvanceBox(BOX_STATUSES[i], to))).toEqual(BOX_STATUSES.slice(i + 1, i + 2))
    }
  })
})
