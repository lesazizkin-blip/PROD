import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import ProfilePage from './ProfilePage'

const me = vi.fn()
const updateProject = vi.fn()
const PROJECT = { id: 'p1', name: 'Переезд', move_date: '2026-11-01', address_from: null, address_to: null, created_at: '2026-10-01T00:00:00Z' }
vi.mock('../api/endpoints', () => ({
  api: {
    me: () => me(),
    myProjects: () => Promise.resolve([{ id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' }]),
    getProject: () => Promise.resolve(PROJECT),
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
})
afterEach(cleanup)

describe('личный кабинет', () => {
  it('показывает логин, проекты и кнопку смены пароля', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'anna' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /Переезд/ })).toBeTruthy()
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
