import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import ProfilePage from './ProfilePage'
import { ThemeProvider } from '../state/ThemeContext'
const me = vi.fn()
vi.mock('../api/endpoints', () => ({ api: { me: () => me(), myProjects: async () => [{ id: 'p1', name: 'Переезд', role: 'owner', move_date: '2026-11-01' }] } }))
const setup = () => render(<ThemeProvider><MemoryRouter><AuthProvider><ProjectProvider><ProfilePage /></ProjectProvider></AuthProvider></MemoryRouter></ThemeProvider>)
beforeEach(() => { localStorage.clear(); me.mockResolvedValue({ id: 1, username: 'anna' }) })
afterEach(cleanup)
describe('аккаунт', () => {
  it('показывает пользователя и безопасность, а проекты ведут на отдельную страницу', async () => {
    setup()
    await screen.findByRole('heading', { name: 'anna' })
    expect((await screen.findByRole('link', { name: /Все проекты/ })).getAttribute('href')).toBe('/projects')
    expect(screen.getByRole('button', { name: 'Сменить пароль' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Помощники' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Название' })).toBeNull()
  })
  it('у демо-аккаунта смены пароля нет', async () => {
    me.mockResolvedValue({ id: 2, username: 'demo' })
    setup()
    await screen.findByRole('heading', { name: 'demo' })
    expect(screen.queryByRole('button', { name: 'Сменить пароль' })).toBeNull()
  })
})
