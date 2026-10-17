import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/endpoints'
import type { FirstDayItem, LostItem } from '../../api/types'
import { ConfirmProvider } from '../../state/ConfirmContext'
import FirstDayChecklist from './FirstDayChecklist'

vi.mock('../../api/endpoints', () => ({ api: { firstDay: vi.fn(), firstDayItems: vi.fn(), boxes: vi.fn(), deleteFirstDay: vi.fn(), updateFirstDay: vi.fn(), bindFirstDay: vi.fn() } }))
let planned: FirstDayItem[], packed: LostItem[]
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }
beforeEach(() => {
  vi.resetAllMocks()
  planned = [{ id: 1, title: 'Чайник из принятого AI-плана', done: false }]
  packed = []
  vi.mocked(api.firstDay).mockImplementation(async () => [...planned])
  vi.mocked(api.firstDayItems).mockImplementation(async () => [...packed])
  vi.mocked(api.boxes).mockImplementation(async (_pid, params) => ({ total: 2, page: params?.page ?? 1, page_size: 1, items: [{ number: params?.page === 2 ? 300 : 1, room: 'Кухня', status: 'packing', project_id: 'p1', items_count: 0, remind_at: null, fill_later: false, created_at: '', updated_at: '' }] }))
  vi.mocked(api.bindFirstDay).mockImplementation(async (_pid, _id, number, name) => {
    const item = { id: 5, box_number: number, name, first_day: true, status: 'packed' as const, lost: false, created_at: '' }
    packed.push({ item, box_number: number, room: 'Кухня', status: 'packing' })
    planned = []
    return item
  })
  vi.mocked(api.updateFirstDay).mockImplementation(async (_pid, _id, changes) => { planned = planned.map(x => ({ ...x, ...changes })); return planned[0] })
})
afterEach(cleanup)
const setup = () => render(<MemoryRouter><ConfirmProvider><FirstDayChecklist pid="p1" /></ConfirmProvider></MemoryRouter>)

describe('единый список первого дня', () => {
  it('возвращает отметку к серверному состоянию после ошибки сохранения', async () => {
    vi.mocked(api.updateFirstDay).mockRejectedValueOnce(new Error('Не сохранено'))
    setup()
    const check = await screen.findByRole('checkbox', { name: 'Чайник из принятого AI-плана' })
    await userEvent.click(check)
    await screen.findByRole('alert')
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Чайник из принятого AI-плана' }) as HTMLInputElement).checked).toBe(false))
  })
  it('показывает принятый AI-пункт без единой коробки и сохраняет отметку готовности', async () => {
    setup()
    const check = await screen.findByRole('checkbox', { name: 'Чайник из принятого AI-плана' })
    await userEvent.click(check)
    await waitFor(() => expect(api.updateFirstDay).toHaveBeenCalledWith('p1', 1, { done: true }))
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Чайник из принятого AI-плана' }) as HTMLInputElement).checked).toBe(true))
  })
  it('видит коробку с последней страницы и не дублирует вещь при повторе частично сохранённой привязки', async () => {
    vi.mocked(api.bindFirstDay).mockRejectedValueOnce(new Error('Повторите сохранение'))
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Указать коробку: Чайник из принятого AI-плана' }))
    await screen.findByRole('option', { name: '№ 300 · Кухня' })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Коробка' }), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить коробку' }))
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить коробку' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.bindFirstDay).toHaveBeenCalledTimes(2)
    expect(api.bindFirstDay).toHaveBeenCalledWith('p1', 1, 300, 'Чайник из принятого AI-плана')
    expect(packed).toHaveLength(1)
    expect(await screen.findByRole('link', { name: '№ 300 · Кухня' })).toBeTruthy()
  })
})
