import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../api/endpoints'
import type { Box, BoxStatus } from '../../api/types'
import RoomLoadingChecklist from './RoomLoadingChecklist'

vi.mock('../../api/endpoints', () => ({ api: { boxes: vi.fn(), transition: vi.fn(), bulkTransition: vi.fn() } }))
const box = (number: number, status: BoxStatus): Box => ({ number, status, room: 'Кухня', project_id: 'p1', fill_later: false, remind_at: null, items_count: 0, created_at: '', updated_at: '' })
const room = { room: 'Кухня', total: 3, by_status: { packing: 1, packed: 1, loaded: 1, delivered: 0, unpacked: 0 }, loaded: 1, loaded_percent: 33, unpacked: 0, unpacked_percent: 0 }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.boxes).mockResolvedValue({ items: [box(1, 'packed'), box(2, 'packing'), box(3, 'loaded')], total: 3, page: 1, page_size: 36 })
  vi.mocked(api.bulkTransition).mockResolvedValue({ updated: [box(1, 'loaded')] })
})
afterEach(cleanup)
async function setup() {
  const changed = vi.fn()
  render(<MemoryRouter><RoomLoadingChecklist pid="p1" room={room} onChanged={changed} /></MemoryRouter>)
  await userEvent.click(screen.getByText('Кухня · 3 кор.'))
  await screen.findByRole('checkbox', { name: 'Погрузить коробку № 1' })
  return changed
}
it('погружает массово только собранные коробки текущей комнаты', async () => {
  const changed = await setup()
  expect((screen.getByRole('checkbox', { name: 'Погрузить коробку № 2' }) as HTMLInputElement).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Погрузить готовые на странице (1)' }))
  await waitFor(() => expect(api.bulkTransition).toHaveBeenCalledWith('p1', [1], 'loaded'))
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
  expect(api.boxes).toHaveBeenCalledWith('p1', { room: 'Кухня', page: 1, page_size: 36 })
})
it('откатывает отметку погрузки после ошибки сервера', async () => {
  vi.mocked(api.transition).mockRejectedValueOnce(new Error('Не удалось погрузить'))
  await setup()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Погрузить коробку № 1' }))
  await screen.findByRole('alert')
  await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Погрузить коробку № 1' }) as HTMLInputElement).checked).toBe(false))
})
