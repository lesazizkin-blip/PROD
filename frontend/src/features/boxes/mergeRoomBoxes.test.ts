import { describe, expect, it } from 'vitest'
import { mergeRoomBoxes } from './mergeRoomBoxes'

const boxes = [
  { label: 'Книги', items: ['Книги', 'Журналы'], tip: 'Маленькая коробка.' },
  { label: 'Хрупкое', items: ['Кружка'], tip: 'Оберните бумагой.' },
  { label: 'Электроника', items: ['Зарядка', 'кружка '], tip: '' },
]

describe('mergeRoomBoxes', () => {
  it('складывает отмеченные в одну на месте первой, вещи без повторов', () => {
    const { boxes: out, merged } = mergeRoomBoxes(boxes, new Set([0, 2]))
    expect(merged).toBe(0)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ label: 'Книги + Электроника', items: ['Книги', 'Журналы', 'Зарядка', 'кружка'], tip: 'Маленькая коробка.' })
    expect(out[1]).toBe(boxes[1])
  })

  it('повтор вещи без учёта регистра и пробелов не дублируется', () => {
    const { boxes: out } = mergeRoomBoxes(boxes, new Set([1, 2]))
    expect(out[1].items).toEqual(['Кружка', 'Зарядка'])
    expect(out[1].tip).toBe('Оберните бумагой.')
  })

  it('меньше двух отмеченных - список не меняется', () => {
    expect(mergeRoomBoxes(boxes, new Set([1]))).toEqual({ boxes, merged: 1 })
    expect(mergeRoomBoxes(boxes, new Set())).toEqual({ boxes, merged: -1 })
  })
})
