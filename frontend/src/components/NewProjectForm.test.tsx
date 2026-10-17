import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
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
  render(<MemoryRouter><AuthProvider><ProjectProvider><NewProjectForm onDone={onDone} /></ProjectProvider></AuthProvider></MemoryRouter>)
  await waitFor(() => expect(localStorage.getItem('movermate.projects.v1')).not.toBeNull()) // список с сервера загружен
  return { onDone }
}

const saved = () => JSON.parse(localStorage.getItem('movermate.projects.v1') ?? '{}')

beforeEach(() => {
  localStorage.clear()
  createProject.mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('создание проекта', () => {
  it('сохраняет проверенный персональный план одним запросом создания', async () => {
    const draft = { tasks: [{ title: 'Переноска для кошки', stage: 'before', offset_days: -3 }], first_day: ['Корм'] }
    // шаг 1 (вопросы) - модели нечего уточнить, шаг 2 - черновик плана; новый Response на каждый вызов
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('plan-questions') ? { questions: [] } : draft))))
    createProject.mockResolvedValue({ id: 'p1', name: 'Переезд' })
    await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Переезд')
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2026-11-01' } })
    await userEvent.type(screen.getByLabelText('Особенности и пожелания'), 'Переезжаем с кошкой')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Предложить персональный план' }))
    await screen.findByLabelText('Задача 1')
    expect(createProject).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01', personal_plan: draft }))
  })
  it('кнопка недоступна, пока нет названия и даты', async () => {
    await setup()
    const submit = screen.getByRole('button', { name: 'Создать проект' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Название переезда'), '   ')
    expect(submit.disabled).toBe(true) // пробелы - не название
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Переезд')
    expect(submit.disabled).toBe(true) // нет даты
  })

  it('отправляет обрезанное название, запоминает проект и сообщает об успехе', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Переезд' })
    const { onDone } = await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), '  Переезд  ')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01' })
    expect(saved()).toEqual({ projects: [{ id: 'p1', name: 'Переезд', role: 'owner' }], currentId: 'p1' })
  })

  it('ошибка сервера показывается, проект не запоминается', async () => {
    createProject.mockRejectedValue(new ApiError('Некорректные данные', 422))
    const { onDone } = await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Переезд')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Некорректные данные')
    expect(onDone).not.toHaveBeenCalled()
    expect(saved().projects).toEqual([])
  })
})
