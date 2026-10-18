import { useState } from 'react'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { api } from '../../api/endpoints'
import type { Box, BoxFilters, BoxStatus } from '../../api/types'
import RelocationBoard from './RelocationBoard'
import BoxMoveNotice from './BoxMoveNotice'
import { recordBoxMove } from './boxMoveEvents'
import { INITIAL_LOCATION_PAGES, type BoxLocation } from './boxLocations'

vi.mock('../../api/endpoints', () => ({ api: { boxes: vi.fn() } }))
vi.mock('./BoxNavigation', () => ({ BoxLink: ({ children, number, pid, ...props }: React.PropsWithChildren<{ number: number; pid: string }>) => <a {...props} href={`/projects/${pid}/boxes/${number}`}>{children}</a> }))
const makeBox = (number: number, status: BoxStatus): Box => ({ number, status, room: 'Кухня', project_id: 'p1', fill_later: false, remind_at: null, items_count: 2, created_at: '', updated_at: '' })
let inventory: Box[]
const changed = vi.fn()
function Harness() {
  const [place, setPlace] = useState<BoxLocation>('old')
  const [pages, setPages] = useState(INITIAL_LOCATION_PAGES)
  return <MemoryRouter><RelocationBoard pid="p1" room="Кухня" summary={null} place={place} onPlace={setPlace} pages={pages} onPage={(p, n) => setPages(prev => prev[p] === n ? prev : { ...prev, [p]: n })} onCache={() => {}} onChanged={changed} /><BoxMoveNotice pid="p1" /></MemoryRouter>
}
beforeEach(() => {
  vi.resetAllMocks()
  inventory = [makeBox(1, 'packed'), makeBox(2, 'loaded'), makeBox(3, 'delivered')]
  vi.mocked(api.boxes).mockImplementation(async (_pid, filters: BoxFilters = {}) => {
    const byPlace = { old: ['packing', 'packed'], truck: ['loaded'], new: ['delivered', 'unpacked'] }
    const list = inventory.filter(box => byPlace[filters.location ?? 'old'].includes(box.status))
    const offset = ((filters.page ?? 1) - 1) * 12
    return { items: list.slice(offset, offset + 12), total: list.length, page: filters.page ?? 1, page_size: 12 }
  })

})
afterEach(cleanup)
it('обновляет места после смены статуса в карточке коробки, без действий на стеллаже', async () => {
  render(<Harness />)
  const oldRack = screen.getByRole('region', { name: 'Старый дом' })
  await within(oldRack).findByRole('link', { name: /001/ })
  expect(within(oldRack).queryByRole('button')).toBeNull()
  const before = inventory[0]
  inventory = inventory.map(box => box.number === 1 ? { ...box, status: 'loaded' } : box)
  act(() => recordBoxMove('p1', before, 'loaded'))
  await screen.findByText('Коробка 001 · Погружена')
  expect(document.querySelector('.box-move-notice--loaded')).toBeTruthy()
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Старый дом' })).queryByText('001')).toBeNull())
  expect(await within(screen.getByRole('region', { name: 'В машине' })).findByText('001')).toBeTruthy()
  expect(changed).toHaveBeenCalledTimes(1)
  expect(api.boxes).toHaveBeenCalledWith('p1', expect.objectContaining({ location: 'truck', room: 'Кухня', page_size: 12 }))
})
it('страницы каждого места независимы и переключение места не сбрасывает их', async () => {
  inventory = Array.from({ length: 26 }, (_, i) => makeBox(i + 1, 'packed'))
  render(<Harness />)
  const pages = await screen.findByRole('navigation', { name: 'Страницы: Старый дом' })
  await userEvent.click(within(pages).getByRole('button', { name: 'Далее' }))
  await within(screen.getByRole('region', { name: 'Старый дом' })).findByText('013')
  await userEvent.click(screen.getByRole('button', { name: /В машине/ }))
  await userEvent.click(screen.getByRole('button', { name: /Старый дом/ }))
  expect(within(pages).getByText(/Страница 2 из 3/)).toBeTruthy()
})
