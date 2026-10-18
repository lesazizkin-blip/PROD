import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import RequireProject from '../components/RequireProject'
import { ProjectProvider, useProjects } from './ProjectContext'

const h = vi.hoisted(() => ({ user: { id: 1, username: 'anna' }, projects: [{ id: 'p1', name: 'Переезд', role: 'owner', move_date: '2026-12-01' }] }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ user: h.user }) }))
vi.mock('../api/endpoints', () => ({ api: { myProjects: async () => h.projects } }))

function Probe({ explicit }: { explicit?: string }) {
  const context = useProjects()
  return <>
    <output aria-label="Текущий проект">{context.ready ? context.currentId ?? 'нет' : 'загрузка'}</output>
    <button onClick={() => context.archiveProject('p1', true)}>Архивировать первый</button>
    <button onClick={() => context.archiveProject('p2', true)}>Архивировать второй</button>
    <button onClick={() => context.archiveProject('p1', false)}>Вернуть первый</button>
    <button onClick={() => context.select('p1')}>Выбрать первый</button>
    <button onClick={() => { void context.reload() }}>Перечитать</button>
    <RequireProject pid={explicit}>{pid => <h1>Работа с проектом {pid}</h1>}</RequireProject>
  </>
}
const setup = (explicit?: string) => render(<MemoryRouter initialEntries={['/boxes']}><ProjectProvider><Probe explicit={explicit} /></ProjectProvider></MemoryRouter>)
beforeEach(() => { localStorage.clear(); h.user = { id: 1, username: 'anna' }; h.projects = [{ id: 'p1', name: 'Переезд', role: 'owner', move_date: '2026-12-01' }] })
afterEach(cleanup)

it('архивация единственного проекта сбрасывает выбор и закрывает рабочие разделы', async () => {
  setup()
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
  await userEvent.click(screen.getByRole('button', { name: 'Архивировать первый' }))
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет')
  expect(screen.queryByRole('heading', { name: 'Работа с проектом p1' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Открыть архив' }).getAttribute('href')).toBe('/projects?tab=archive')
  expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Перечитать' }))
  await waitFor(() => expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет'))
  await userEvent.click(screen.getByRole('button', { name: 'Выбрать первый' }))
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет')
})

it('перезагрузка не возвращает архивный проект из старого сохранённого выбора', async () => {
  localStorage.setItem('movermate.project-archive.v1.1', '["p1"]')
  localStorage.setItem('movermate.projects.v1', JSON.stringify({ projects: h.projects, currentId: 'p1' }))
  setup()
  await waitFor(() => expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет'))
  expect(screen.queryByRole('heading', { name: 'Работа с проектом p1' })).toBeNull()
  expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}').currentId).toBeNull()
})

it('прямая ссылка требует восстановления архивного проекта', async () => {
  localStorage.setItem('movermate.project-archive.v1.1', '["p1"]')
  setup('p1')
  await screen.findByRole('heading', { name: 'Проект в архиве' })
  expect(screen.queryByRole('heading', { name: 'Работа с проектом p1' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Восстановить проект' }))
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('p1')
})

it('выбирает другой активный проект, а последний архивированный не становится текущим', async () => {
  h.projects.push({ id: 'p2', name: 'Дача', role: 'owner', move_date: '2026-12-01' })
  setup()
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
  await userEvent.click(screen.getByRole('button', { name: 'Архивировать первый' }))
  await screen.findByRole('heading', { name: 'Работа с проектом p2' })
  await userEvent.click(screen.getByRole('button', { name: 'Архивировать второй' }))
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет')
  await userEvent.click(screen.getByRole('button', { name: 'Вернуть первый' }))
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
})

it('подхватывает архив из другой вкладки и не смешивает аккаунты', async () => {
  const view = setup()
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
  localStorage.setItem('movermate.project-archive.v1.1', '["p1"]')
  fireEvent(window, new StorageEvent('storage', { key: 'movermate.project-archive.v1.1' }))
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('нет')
  h.user = { id: 2, username: 'bob' }
  view.rerender(<MemoryRouter><ProjectProvider><Probe /></ProjectProvider></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Работа с проектом p1' })
  expect(screen.getByLabelText('Текущий проект').textContent).toBe('p1')
})
