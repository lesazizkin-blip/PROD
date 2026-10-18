import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ApiError } from '../api/client'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import NewProjectForm from './NewProjectForm'
import { FIRST_DAY_BASICS } from '../features/planner/firstDayDefaults'

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
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01', plan_mode: 'standard', first_day: FIRST_DAY_BASICS, personal_plan: draft }))
  })
  it('без названия и даты кнопка подсказывает, какие поля заполнить, и ставит фокус на первое', async () => {
    await setup()
    const submit = screen.getByRole('button', { name: 'Создать проект' }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    await userEvent.type(screen.getByLabelText('Название переезда'), '   ') // пробелы - не название
    await userEvent.click(submit)
    expect(createProject).not.toHaveBeenCalled()
    const nameField = screen.getByLabelText('Название переезда')
    expect(screen.getByText('Введите название переезда').id).toBe('new-project-name-error')
    expect(nameField.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(nameField)
    expect(screen.getByText('Выберите дату переезда').id).toBe('new-project-move_date-error')
    expect(screen.getByLabelText('Дата переезда').getAttribute('aria-invalid')).toBe('true')
    await userEvent.type(nameField, 'Переезд')
    expect(screen.queryByText('Введите название переезда')).toBeNull()
    expect(nameField.getAttribute('aria-invalid')).toBe('false')
  })

  it('несуществующая дата (29.02.2100) подсвечивает поле даты, а не молчит', async () => {
    await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Переезд в офис')
    const dateField = screen.getByLabelText('Дата переезда') as HTMLInputElement
    // браузер с набранной несуществующей датой отдаёт пустое значение и validity.badInput
    Object.defineProperty(dateField, 'validity', { configurable: true, value: { badInput: true } })
    fireEvent.blur(dateField)
    expect(screen.getByText(/Такой даты нет в календаре/).id).toBe('new-project-move_date-error')
    expect(dateField.getAttribute('aria-invalid')).toBe('true')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    expect(createProject).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(dateField)
  })

  it('дата дальше 2 лет: причина под полем даты', async () => {
    await setup()
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2100-03-01' } })
    expect(screen.getByText('Дата переезда — не дальше чем через 2 года').id).toBe('new-project-move_date-error')
  })

  it('отправляет обрезанное название, запоминает проект и сообщает об успехе', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Переезд' })
    const { onDone } = await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), '  Переезд  ')
    await userEvent.type(screen.getByLabelText('Дата переезда'), '2026-11-01')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(createProject).toHaveBeenCalledWith({ name: 'Переезд', move_date: '2026-11-01', plan_mode: 'standard', first_day: FIRST_DAY_BASICS })
    expect(saved()).toEqual({ projects: [{ id: 'p1', name: 'Переезд', role: 'owner' }], currentId: 'p1' })
  })

  it('пустой план требует явного выбора и не отправляет базовые пункты', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Пустой' })
    await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Пустой')
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2026-12-01' } })
    await userEvent.selectOptions(screen.getByLabelText('Начальный план'), 'empty')
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Пустой', move_date: '2026-12-01', plan_mode: 'empty' }))
  })

  it('переезд на несколько дней: дата «по» уходит на сервер, конец раньше начала не отправить', async () => {
    createProject.mockResolvedValue({ id: 'p1', name: 'Долгий', move_date: '2026-11-01', move_date_end: '2026-11-03' })
    await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Долгий')
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2026-11-03' } })
    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-11-01' } })
    const submit = screen.getByRole('button', { name: 'Создать проект' }) as HTMLButtonElement
    expect(screen.getByText('Дата окончания раньше даты начала').id).toBe('new-project-move_date_end-error')
    expect(screen.getByLabelText(/^По/).getAttribute('aria-invalid')).toBe('true')
    await userEvent.click(submit)
    expect(createProject).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByLabelText(/^По/))
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText(/^По/), { target: { value: '2026-11-03' } })
    await userEvent.click(submit)
    await waitFor(() => expect(createProject).toHaveBeenCalledWith({ name: 'Долгий', move_date: '2026-11-01', move_date_end: '2026-11-03', plan_mode: 'standard', first_day: FIRST_DAY_BASICS }))
    expect(saved().projects[0].move_date_end).toBe('2026-11-03')
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

  it('422 сервера по полю подсвечивает это поле', async () => {
    createProject.mockRejectedValue(new ApiError('Некорректные данные', 422, 'validation_failed', { move_date: 'Value error, Дата переезда уже прошла' }))
    await setup()
    await userEvent.type(screen.getByLabelText('Название переезда'), 'Переезд')
    fireEvent.change(screen.getByLabelText('Дата переезда'), { target: { value: '2026-11-01' } })
    await userEvent.click(screen.getByRole('button', { name: 'Создать проект' }))
    expect((await screen.findByText('Дата переезда уже прошла')).id).toBe('new-project-move_date-error')
    expect(screen.getByLabelText('Дата переезда').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Название переезда').getAttribute('aria-invalid')).toBe('false')
  })
})
