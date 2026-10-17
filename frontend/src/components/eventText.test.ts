import { describe, expect, it } from 'vitest'
import type { AppEvent } from '../api/types'
import { describeEvent } from './eventText'

const ev = (type: string, data: Record<string, unknown> = {}, entity_id = '3'): AppEvent =>
  ({ id: 1, type, entity: 'box', entity_id, data, created_at: '2026-10-18T10:00:00Z' }) as AppEvent

describe('уведомления: человеческий текст вместо служебных кодов', () => {
  it('возврат коробки назад и исправление', () => {
    expect(describeEvent(ev('box.status_changed', { from: 'loaded', to: 'packed' }))).toBe('Коробка № 3 возвращена на этап «Собрана» (была «Погружена»)')
    expect(describeEvent(ev('box.status_changed', { from: 'packed', to: 'loaded' }))).toBe('Коробка № 3: Собрана → Погружена')
    expect(describeEvent(ev('box.status_corrected', { from: 'loaded', to: 'packed', reason: '' }))).toBe('Коробка № 3 возвращена на этап «Собрана» (была «Погружена»)')
  })
  it('бюджет, первый день, вещи, настройки', () => {
    expect(describeEvent(ev('expense.created', { title: 'Грузчики', planned: 12000 })).replace(/\s/g, ' ')).toBe('В бюджет добавлена статья «Грузчики» — 12 000 ₽')
    expect(describeEvent(ev('expense.deleted', { title: 'Такси' }))).toBe('Из бюджета удалена статья «Такси»')
    expect(describeEvent(ev('expense.deleted'))).toBe('Из бюджета удалена статья')
    expect(describeEvent(ev('first_day.bound', { name: 'Чайник', box_number: 2 }))).toBe('«Чайник» положили в коробку № 2')
    expect(describeEvent(ev('item.status_changed', { name: 'Плед', to: 'unpacked' }))).toBe('«Плед»: теперь «распакована»')
    expect(describeEvent(ev('project.updated', { fields: ['move_date', 'name'] }))).toBe('Изменены настройки проекта: дата переезда, название')
  })
  it('неизвестный тип не показывает код', () => {
    const text = describeEvent(ev('something.new'))
    expect(text).not.toContain('.')
  })
  it('перенос вещи и отметка о повреждении', () => {
    expect(describeEvent(ev('item.moved', { name: 'Чайник', from_box: 2, to_box: 5 }))).toBe('«Чайник» переложили из коробки № 2 в № 5')
    expect(describeEvent(ev('item.damage_changed', { name: 'Ваза', damaged: true }))).toBe('Отмечено повреждение: «Ваза»')
  })
})
