import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadProjects, saveProjects } from './projects'

const A = { id: 'a', name: 'Первый' }
const B = { id: 'b', name: 'Второй' }

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('список проектов в браузере', () => {
  it('пусто, пока ничего не сохранено', () => {
    expect(loadProjects()).toEqual({ projects: [], currentId: null })
  })

  it('сохраняется и читается (данные переживают обновление страницы)', () => {
    saveProjects({ projects: [A, B], currentId: 'b' })
    expect(loadProjects()).toEqual({ projects: [A, B], currentId: 'b' })
  })

  it('битый JSON и чужие данные не роняют приложение', () => {
    localStorage.setItem('movermate.projects.v1', '{не json')
    expect(loadProjects()).toEqual({ projects: [], currentId: null })
    localStorage.setItem('movermate.projects.v1', JSON.stringify({ projects: 'нет' }))
    expect(loadProjects()).toEqual({ projects: [], currentId: null })
  })

  it('мусорные записи отбрасываются, а неизвестный текущий проект заменяется первым', () => {
    localStorage.setItem('movermate.projects.v1', JSON.stringify({ projects: [A, { id: 5 }, null], currentId: 'zzz' }))
    expect(loadProjects()).toEqual({ projects: [A], currentId: 'a' })
  })

  it('недоступный localStorage: чтение даёт пустой список, запись молча пропускается', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('запрещено')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('запрещено')
    })
    expect(loadProjects()).toEqual({ projects: [], currentId: null })
    expect(() => saveProjects({ projects: [A], currentId: 'a' })).not.toThrow()
  })
})
