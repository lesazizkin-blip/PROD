import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import ProfilePage from './ProfilePage'

const me = vi.fn()
const myProjects = vi.fn()
const updateProject = vi.fn()
const PROJECT = { id: 'p1', name: 'Переезд', move_date: '2026-11-01', address_from: null, address_to: null, created_at: '2026-10-01T00:00:00Z' }
vi.mock('../api/endpoints', () => ({
  api: {
    me: () => me(),
    myProjects: () => myProjects(),
    getProject: (id: string) => Promise.resolve(id === 'p2' ? { ...PROJECT, id: 'p2', name: 'Дача' } : PROJECT),
    members: () => Promise.resolve([{ user_id: 1, username: 'anna', role: 'owner' }]),
    updateProject: (...a: unknown[]) => updateProject(...a),
  },
}))

const setup = () =>
  render(<MemoryRouter><AuthProvider><ProjectProvider><ProfilePage /></ProjectProvider></AuthProvider></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  me.mockResolvedValue({ id: 1, username: 'anna' })
  updateProject.mockReset().mockResolvedValue(PROJECT)
  myProjects.mockResolvedValue([{ id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' }])
})
afterEach(cleanup)

describe('личный кабинет', () => {
  it('клик по проекту открывает его настройки, а не сам проект', async () => {
    myProjects.mockResolvedValue([
      { id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' },
      { id: 'p2', name: 'Дача', move_date: '2026-12-01', role: 'owner' },
    ])
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Настройки проекта «Дача»' }))
    expect(await screen.findByText('Настройки проекта «Дача»')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Настройки проекта «Дача»' }).getAttribute('aria-pressed')).toBe('true')
    // Viewing settings does not switch the active project.
    expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBe('p1')
  })

  it('выбирает проект в аккаунте и сохраняет выбор после повторного открытия', async () => {
    myProjects.mockResolvedValue([
      { id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' },
      { id: 'p2', name: 'Дача', move_date: '2026-12-01', role: 'member' },
    ])
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Выбрать проект «Дача»' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBe('p2'))
    cleanup()
    setup()
    expect(await screen.findByRole('button', { name: 'Открыть проект «Дача»' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBe('p2')
  })

  it('показывает логин, проекты и кнопку смены пароля', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'anna' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Настройки проекта «Переезд»' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Сменить пароль' })).toBeTruthy()
  })

  it('у демо-аккаунта смены пароля нет', async () => {
    me.mockResolvedValue({ id: 2, username: 'demo' })
    setup()
    await screen.findByRole('heading', { name: 'demo' })
    expect(screen.queryByRole('button', { name: 'Сменить пароль' })).toBeNull()
  })

  it('сохраняет адреса проекта, пустые отправляет как null', async () => {
    setup()
    const from = await screen.findByPlaceholderText('ул. Садовая, 5')
    await userEvent.type(from, '  Садовая, 5 ')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    await waitFor(() => expect(updateProject).toHaveBeenCalled())
    expect(updateProject).toHaveBeenCalledWith('p1', { name: 'Переезд', move_date: '2026-11-01', address_from: 'Садовая, 5', address_to: null })
    expect(await screen.findByText('Сохранено')).toBeTruthy()
  })
})
