import { describe, expect, it } from 'vitest'
import type { Budget, Progress, Project, Task } from '../../api/types'
import { STAGES, stagesFor } from './journeyStages'

const project = { id: 'p1', name: 'Переезд', move_date: '2026-11-01', address_from: 'Садовая, 5', address_to: null, created_at: '' } as Project
const progress = (by: Partial<Progress['by_status']>, total: number) =>
  ({ boxes_total: total, by_status: { packing: 0, packed: 0, loaded: 0, delivered: 0, unpacked: 0, ...by }, unpacked_percent: 0, rooms: [] }) as unknown as Progress
const task = (stage: Task['stage'], done: boolean) => ({ id: Math.random(), stage, done, title: 't' }) as Task
const budget = (items: Budget['items']): Budget => ({ items, planned: items.reduce((s, e) => s + e.planned, 0), actual: 0, variance: 0 })

describe('путь переезда', () => {
  it('7 этапов от решения до «обжиться»', () => {
    expect(STAGES.map((s) => s.title)).toEqual(['Решение', 'Новое жильё', 'Подготовка', 'Подрядчики и бюджет', 'Упаковка', 'День переезда', 'Обжиться'])
  })

  it('новый проект: текущий этап - первый, остальное впереди', () => {
    const s = stagesFor({ project: { ...project, address_from: null }, tasks: [], progress: progress({}, 0), budget: budget([]) })
    expect(s.map((x) => x.state)).toEqual(['active', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
    expect(s[0].detail).toBe('Смета ещё не посчитана')
  })

  it('по данным: смета посчитана, адрес частично, план в работе, всё собрано и наполовину доехало', () => {
    const s = stagesFor({
      project,
      tasks: [task('before', true), task('before', false), task('after', false)],
      progress: progress({ packed: 1, loaded: 1, delivered: 2 }, 4),
      budget: budget([{ id: 1, category: 'movers', title: 'Грузчики', planned: 12000, actual: 13000 }]),
    })
    expect(s.map((x) => x.state)).toEqual(['done', 'active', 'active', 'done', 'done', 'active', 'todo'])
    expect(s[4].detail).toBe('Собрано коробок 4 из 4')
    expect(s[5].detail).toBe('Погружено 3, доехало 2 из 4')
  })

  it('всё распаковано и дела закрыты - последний этап сделан', () => {
    const s = stagesFor({
      project: { ...project, address_to: 'Лесная, 12' },
      tasks: [task('before', true), task('after', true)],
      progress: progress({ unpacked: 3 }, 3),
      budget: budget([{ id: 1, category: 'movers', title: 'Грузчики', planned: 1, actual: 1 }]),
    })
    expect(s.every((x) => x.state === 'done')).toBe(true)
  })
})
