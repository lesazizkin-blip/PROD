import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import NewProjectForm from './NewProjectForm'

const createProject = vi.fn()
vi.mock('../api/endpoints', () => ({
  api: {
    createProject: (...a: unknown[]) => createProject(...a),
    me: () => Promise.resolve({ id: 1, username: 'anna' }),
    myProjects: () => Promise.resolve([]),
  },
}))

async function setup(onDone = vi.fn()) {
  render(<AuthProvider><ProjectProvider><NewProjectForm onDone={onDone} /></ProjectProvider></AuthProvider>)
  await waitFor(() => expect(localStorage.getItem('movermate.projects.v1')).not.toBeNull()) // список с сервера загружен
  return { onDone }
}

const saved = () => JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}')

beforeEach(() => {
  localStorage.clear()
  createProject.mockReset()
})
afterEach(cleanup)

describe('создание проекта', () => {
  it('кнопка недоступна, пока нет названия и даты', async () => {
    await setup()
    const submit = screen.getByRole('button', { name: 'Создать проект' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Название'), '   ')
    expect(submit.disabled).toBe(true) // пробелы - не название
    await userEvent.type(screen.getByLabelText('Название'), 'Переезд')
    expect(submit.disabled).toBe(true) // нет даты
  })

  it('отправляет обрезанное название, запоминает проект и сообщает об успехе', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Переезд' })
    const { onDone } = await setup()
    await userEvent.type(screen.getByLabelText('Название'), '  Переезд  ')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01' })
    expect(saved()).toEqual({ projects: [{ id: 'p1', name: 'Переезд', role: 'owner' }], currentId: 'p1' })
  })

  it('ошибка сервера показывается, проект не запоминается', async () => {
    createProject.mockRejectedValue(new ApiError('Некорректные данные', 422))
    const { onDone } = await setup()
    await userEvent.type(screen.getByLabelText('Название'), 'Переезд')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Некорректные данные')
    expect(onDone).not.toHaveBeenCalled()
    expect(saved().projects).toEqual([])
  })
})
