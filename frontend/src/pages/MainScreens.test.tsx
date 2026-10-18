import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoxNavigationProvider } from '../features/boxes/BoxNavigation'
import { AuthProvider } from '../state/AuthContext'
import { ConfirmProvider } from '../state/ConfirmContext'
import { ProjectProvider } from '../state/ProjectContext'
import BoxesPage from './BoxesPage'
import ProgressPage from './ProgressPage'

/** Главные экраны минимума ТЗ (раздел 7): «Коробки и поиск» и «Прогресс» с данными из API. */

const STATUS = { packing: 1, packed: 0, loaded: 1, delivered: 0, unpacked: 1 }
const PROGRESS = {
  boxes_total: 3,
  by_status: STATUS,
  unpacked_percent: 33.3,
  coverage: 1,
  rooms: [{ room: 'Кухня', total: 2, by_status: STATUS, loaded: 1, loaded_percent: 50, unpacked: 1, unpacked_percent: 50 }],
}
const BOX = (number: number, room: string, status: string) => ({
  number, project_id: 'p1', room, status, fill_later: false, remind_at: null, items_count: 2,
  created_at: '2026-10-18T07:00:00Z', updated_at: '2026-10-18T07:00:00Z',
})

const search = vi.fn()
const boxes = vi.fn()
const createBox = vi.fn()

// в jsdom у <dialog> нет showModal/close
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }

// камера и уменьшение фото в jsdom не работают: «фото» - сразу готовый data URL
vi.mock('../components/PhotoPicker', () => ({
  default: ({ label, onPhoto }: { label: string; onPhoto: (image: string) => Promise<void> }) => (
    <button onClick={() => void onPhoto('data:image/jpeg;base64,AAAA')}>{label}</button>
  ),
}))

vi.mock('../api/endpoints', () => ({
  api: {
    me: () => Promise.resolve({ id: 1, username: 'anna' }),
    myProjects: () => Promise.resolve([{ id: 'p1', name: 'Переезд', move_date: '2026-11-01', role: 'owner' }]),
    progress: () => Promise.resolve(PROGRESS),
    lostItems: () => Promise.resolve([{ item: { id: 9, name: 'Зарядка', status: 'lost', lost: true, damaged: false, first_day: false, box_number: 3, created_at: '' }, box_number: 3, room: 'Кухня', status: 'loaded' }]),
    hints: () => Promise.resolve([]),
    firstDay: () => Promise.resolve([]),
    firstDayItems: () => Promise.resolve([]),
    tasks: () => Promise.resolve([]),
    budget: () => Promise.resolve({ items: [], planned: 0, actual: 0, variance: 0 }),
    reminders: () => Promise.resolve([]),
    boxes: (...a: unknown[]) => boxes(...a),
    search: (...a: unknown[]) => search(...a),
    roomPlan: () => Promise.resolve({
      room: 'Кабинет',
      boxes: [
        { label: 'Книги', items: ['Книги'], tip: '' },
        { label: 'Хрупкое', items: ['Кружка', 'Лампа'], tip: '' },
        { label: 'Электроника', items: ['Зарядка'], tip: '' },
      ],
    }),
    createBox: (...a: unknown[]) => createBox(...a),
  },
}))

const setup = (page: React.ReactNode) =>
  render(
    <MemoryRouter>
      <AuthProvider><ProjectProvider><ConfirmProvider><BoxNavigationProvider>{page}</BoxNavigationProvider></ConfirmProvider></ProjectProvider></AuthProvider>
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  boxes.mockReset().mockImplementation((_pid: string, f: { number?: number }) =>
    Promise.resolve(f?.number ? { items: [BOX(f.number, 'Спальня', 'packing')], total: 1, page: 1, page_size: 36 } : { items: [BOX(1, 'Кухня', 'unpacked'), BOX(3, 'Кухня', 'loaded')], total: 2, page: 1, page_size: 36 }),
  )
  search.mockReset().mockResolvedValue({
    items: [{ item_id: 9, name: 'Зарядка для телефона', item_status: 'lost', lost: true, damaged: false, box_number: 3, room: 'Кухня', status: 'loaded' }],
    total: 1, page: 1, page_size: 50,
  })
})
afterEach(cleanup)

describe('Прогресс', () => {
  it('счётчики по статусам, прогресс комнаты без раскрытия и потерянные вещи', async () => {
    setup(<ProgressPage />)
    expect(await screen.findByText(/Всего 3 коробки/)).toBeTruthy()
    // прогресс погрузки и распаковки по комнате виден сразу (п. 5.4 ТЗ)
    expect(screen.getByText(/Погружено 1 из 2 · распаковано 1 из 2/)).toBeTruthy()
    expect(await screen.findByText(/Зарядка/)).toBeTruthy()
  })
})

describe('Коробки и поиск', () => {
  it('поиск вещи показывает коробку, комнату и отметку «не могу найти»', async () => {
    setup(<BoxesPage />)
    await userEvent.type(await screen.findByPlaceholderText(/Вещь или номер коробки/), 'зарядка')
    await waitFor(() => expect(search).toHaveBeenCalled())
    expect(await screen.findByText(/Коробка № 3 · Кухня · не могу найти/)).toBeTruthy()
  })

  it('номер с этикетки #003 находит коробку по номеру', async () => {
    setup(<BoxesPage />)
    await userEvent.type(await screen.findByPlaceholderText(/Вещь или номер коробки/), '#003')
    await waitFor(() => expect(boxes).toHaveBeenCalledWith('p1', { number: 3 }))
  })
})

describe('Комната по фото', () => {
  it('отмеченные коробки объединяются в одну до создания, можно вернуть как было', async () => {
    createBox.mockReset().mockResolvedValue({})
    setup(<BoxesPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Комната по фото/ }))
    await userEvent.type(screen.getByPlaceholderText('Кухня'), 'Кабинет')
    await userEvent.click(screen.getByRole('button', { name: 'Сфотографировать комнату' }))
    expect(await screen.findByText(/Предлагаем 3 коробки/)).toBeTruthy()

    await userEvent.click(screen.getByRole('checkbox', { name: /Книги/ }))
    await userEvent.click(screen.getByRole('button', { name: /Объединить отмеченные \(2\)/ }))
    expect(screen.getByText(/Предлагаем 2 коробки/)).toBeTruthy()
    expect(screen.getByText('Кружка, Лампа, Зарядка')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Вернуть как предложено' }))
    expect(screen.getByText(/Предлагаем 3 коробки/)).toBeTruthy()
    await userEvent.click(screen.getByRole('checkbox', { name: /Книги/ }))
    await userEvent.click(screen.getByRole('button', { name: /Объединить отмеченные \(2\)/ }))

    await userEvent.click(screen.getByRole('button', { name: /Создать коробки \(1\)/ }))
    await waitFor(() => expect(createBox).toHaveBeenCalledTimes(1))
    expect(createBox).toHaveBeenCalledWith('p1', { room: 'Кабинет', items_text: 'Кружка\nЛампа\nЗарядка', fill_later: false })
  })
})
