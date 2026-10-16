import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { ProjectProvider } from '../state/ProjectContext'
import NewProjectForm from './NewProjectForm'

const createProject = vi.fn()
const getProject = vi.fn()
vi.mock('../api/endpoints', () => ({ api: { createProject: (...a: unknown[]) => createProject(...a), getProject: (...a: unknown[]) => getProject(...a) } }))

function setup(onDone = vi.fn()) {
  render(<ProjectProvider><NewProjectForm onDone={onDone} /></ProjectProvider>)
  return { onDone }
}

beforeEach(() => {
  localStorage.clear()
  createProject.mockReset()
  getProject.mockReset()
})
afterEach(cleanup)

describe('создание проекта', () => {
  it('кнопка недоступна, пока нет названия и даты', async () => {
    setup()
    const submit = screen.getByRole('button', { name: 'Создать проект' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Название'), '   ')
    expect(submit.disabled).toBe(true) // пробелы - не название
    await userEvent.type(screen.getByLabelText('Название'), 'Переезд')
    expect(submit.disabled).toBe(true) // нет даты
  })

  it('отправляет обрезанное название, запоминает проект и сообщает об успехе', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Переезд' })
    const { onDone } = setup()
    await userEvent.type(screen.getByLabelText('Название'), '  Переезд  ')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01' })
    expect(JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}')).toEqual({ projects: [{ id: 'p1', name: 'Переезд' }], currentId: 'p1' })
  })

  it('ошибка сервера показывается, проект не запоминается', async () => {
    createProject.mockRejectedValue(new ApiError('Некорректные данные', 422))
    const { onDone } = setup()
    await userEvent.type(screen.getByLabelText('Название'), 'Переезд')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Некорректные данные')
    expect(onDone).not.toHaveBeenCalled()
    expect(localStorage.getItem('movermate.projects.v1')).toBeNull()
  })

  it('«Открыть демо-проект» подключает проект с фиксированным id', async () => {
    getProject.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', name: 'Переезд на Лесную' })
    const { onDone } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Открыть демо-проект' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(getProject).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001')
  })
})
