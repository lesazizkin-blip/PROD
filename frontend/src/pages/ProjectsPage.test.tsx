import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import ProjectsPage from './ProjectsPage'
import ProjectSettingsPage from './ProjectSettingsPage'
const me = vi.fn()
const updateProject = vi.fn()
const projects = [{ id: 'p1', name: 'Переезд', role: 'owner', move_date: '2026-11-01' }, { id: 'p2', name: 'Дача', role: 'member', move_date: '2026-12-01' }]
vi.mock('../api/endpoints', () => ({ api: {
  me: () => me(), myProjects: async () => projects,
  getProject: async (id: string) => ({ ...projects.find(p => p.id === id), address_from: null, address_to: null, created_at: '' }),
  updateProject: (...args: unknown[]) => updateProject(...args), members: async () => [{ user_id: 1, username: 'anna', role: 'owner' }],
} }))
const setup = (path = '/projects') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><ProjectProvider><Routes><Route path="/projects" element={<ProjectsPage />} /><Route path="/projects/:pid/settings" element={<ProjectSettingsPage />} /><Route path="/" element={<h1>План</h1>} /></Routes></ProjectProvider></AuthProvider></MemoryRouter>)
beforeEach(() => { localStorage.clear(); me.mockResolvedValue({ id: 1, username: 'anna' }); updateProject.mockReset().mockResolvedValue({}) })
afterEach(cleanup)
it('открывает выбранный проект и сохраняет выбор', async () => {
  setup()
  await userEvent.click(await screen.findByRole('button', { name: 'Выбрать проект «Дача»' }))
  await screen.findByRole('heading', { name: 'План' })
  expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBe('p2')
})
it('хранит локальный архив после перезагрузки и умеет восстановить проект', async () => {
  setup()
  await userEvent.click(await screen.findByRole('button', { name: 'Архивировать проект «Переезд»' }))
  expect(screen.getByRole('tab', { name: 'Архив (1)' }).getAttribute('aria-selected')).toBe('true')
  expect(JSON.parse(localStorage.getItem('movermate.project-archive.v1.1') ?? '[]')).toEqual(['p1'])
  cleanup(); setup()
  await screen.findByRole('button', { name: 'Выбрать проект «Дача»' })
  expect(screen.queryByRole('heading', { name: 'Переезд' })).toBeNull()
  await userEvent.click(screen.getByRole('tab', { name: 'Архив (1)' }))
  await userEvent.click(screen.getByRole('button', { name: 'Восстановить проект «Переезд»' }))
  expect(screen.getByRole('tab', { name: 'Активные (2)' }).getAttribute('aria-selected')).toBe('true')
  expect(updateProject).not.toHaveBeenCalled()
})
it('не применяет архив другого аккаунта на том же устройстве', async () => {
  localStorage.setItem('movermate.project-archive.v1.1', JSON.stringify(['p1']))
  me.mockResolvedValue({ id: 2, username: 'bob' })
  setup()
  await screen.findByRole('button', { name: 'Архивировать проект «Переезд»' })
  expect(screen.getByRole('tab', { name: 'Архив (0)' })).toBeTruthy()
})
it('настройки и помощники принадлежат конкретному проекту', async () => {
  setup()
  await userEvent.click(await screen.findByRole('link', { name: 'Настройки проекта «Переезд»' }))
  const from = await screen.findByPlaceholderText('ул. Садовая, 5')
  await userEvent.type(from, '  Садовая, 5 ')
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  await waitFor(() => expect(updateProject).toHaveBeenCalledWith('p1', { name: 'Переезд', move_date: '2026-11-01', address_from: 'Садовая, 5', address_to: null }))
  await userEvent.click(screen.getByRole('tab', { name: 'Помощники' }))
  expect(await screen.findByRole('heading', { name: 'Помощники' })).toBeTruthy()
  expect(screen.queryByPlaceholderText('ул. Садовая, 5')).toBeNull()
})
