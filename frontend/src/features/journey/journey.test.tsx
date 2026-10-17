import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../state/AuthContext'
import { ProjectProvider } from '../../state/ProjectContext'
import BudgetPage from './BudgetPage'
import CalculatorPage from './CalculatorPage'

const me = vi.fn()
const calculator = vi.fn()
const addExpense = vi.fn()
const updateExpense = vi.fn()
const transition = vi.fn()
const boxesCall = vi.fn()
const ESTIMATE = {
  boxes: { low: 40, high: 60 }, volume_m3: { low: 12, high: 18 }, vehicle: 'Грузовик 18–20 м³', movers: 3,
  hours: { low: 4, high: 6 }, prep_weeks: 3, total: { low: 30000, high: 50000 },
  costs: [
    { category: 'movers', title: 'Грузчики: 3 чел.', cost: { low: 10000, high: 20000 } },
    { category: 'materials', title: 'Коробки', cost: { low: 5000, high: 9000 } },
  ],
  date_advice: ['Хорошая дата: будний день вне пика переездов.'], assumptions: 'Ориентировочная оценка',
}
const BOXES = [
  { number: 1, room: 'Кухня', status: 'packed', items_count: 3, fill_later: false },
  { number: 2, room: 'Спальня', status: 'loaded', items_count: 2, fill_later: false },
  { number: 3, room: 'Ванная', status: 'packed', items_count: 1, fill_later: false },
]

vi.mock('../../api/endpoints', () => ({
  api: {
    me: () => me(),
    myProjects: () => Promise.resolve([{ id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' }]),
    calculator: (body: unknown) => calculator(body),
    addExpense: (...a: unknown[]) => addExpense(...a),
    updateExpense: (...a: unknown[]) => updateExpense(...a),
    deleteExpense: () => Promise.resolve(),
    budget: () => Promise.resolve({
      items: [{ id: 7, category: 'movers', title: 'Грузчики', planned: 12000, actual: null }],
      planned: 12000, actual: 0, variance: 0,
    }),
    boxes: (_pid: string, filters: { page_size?: number }) => {
      boxesCall(filters)
      return Promise.resolve({ items: BOXES, total: 3, page: 1, page_size: filters.page_size })
    },
    transition: (...a: unknown[]) => transition(...a),
  },
}))

const setup = (page: React.ReactNode) =>
  render(<MemoryRouter><AuthProvider><ProjectProvider>{page}</ProjectProvider></AuthProvider></MemoryRouter>)

beforeEach(() => {
  localStorage.clear()
  me.mockResolvedValue({ id: 1, username: 'anna' })
  calculator.mockReset().mockResolvedValue(ESTIMATE)
  addExpense.mockReset().mockResolvedValue({})
  updateExpense.mockReset().mockResolvedValue({})
  transition.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

describe('калькулятор', () => {
  it('гость получает оценку и приглашение начать переезд', async () => {
    me.mockRejectedValue(new Error('401'))
    setup(<CalculatorPage />)
    await userEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))
    expect(await screen.findByText('30 000 ₽ – 50 000 ₽')).toBeTruthy()
    expect(calculator.mock.calls[0][0]).toMatchObject({ rooms: 2, people: 2, move_date: null })
    expect(screen.getByRole('link', { name: /Начать переезд/ })).toBeTruthy()
  })

  it('смета переносится в бюджет проекта серединой диапазона', async () => {
    setup(<CalculatorPage />)
    await screen.findByText('Калькулятор переезда')
    await userEvent.click(screen.getByRole('button', { name: 'Рассчитать' }))
    await userEvent.click(await screen.findByRole('button', { name: /Перенести смету в бюджет/ }))
    await waitFor(() => expect(addExpense).toHaveBeenCalledTimes(2))
    expect(addExpense.mock.calls[0]).toEqual(['p1', { category: 'movers', title: 'Грузчики: 3 чел.', planned: 15000 }])
  })
})

describe('бюджет', () => {
  it('факт вносится в строке и уходит на сервер', async () => {
    setup(<BudgetPage />)
    const actual = await screen.findByLabelText('Факт: Грузчики')
    await userEvent.type(actual, '13500')
    fireEvent.blur(actual)
    await waitFor(() => expect(updateExpense).toHaveBeenCalledWith('p1', 7, { actual: 13500 }))
  })
})
