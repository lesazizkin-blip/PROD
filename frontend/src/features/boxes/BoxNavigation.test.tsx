import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api/endpoints'
import type { BoxCard } from '../../api/types'
import { BoxLink, BoxNavigationProvider, useBoxNavigation } from './BoxNavigation'

const card: BoxCard = { number: 1, project_id: 'p1', room: 'Кухня', status: 'packing', fill_later: false, remind_at: null, items_count: 0, items: [], created_at: '', updated_at: '' }
const nativeTransition = document.startViewTransition

function Detail() {
  const navigation = useBoxNavigation()
  return <article><h1 id="box-heading" tabIndex={-1}>{navigation.cardSeed('p1', 1)?.room ?? 'Загрузка коробки'}</h1><button onClick={() => void navigation.returnToShelf('p1', 1)}>Назад</button></article>
}

function Shelf() {
  const navigation = useBoxNavigation()
  const saved = navigation.shelfView('p1')
  return <><button onClick={() => navigation.rememberShelf({ pid: 'p1', page: 9, query: '', room: 'Кухня', scrollY: 800, boxes: null, hits: null, byNumber: null, summary: null })}>Запомнить страницу 9</button><span>Страница {saved?.page ?? 1}</span><BoxLink pid="p1" number={1}>Коробка 001</BoxLink></>
}

function setup() {
  return render(<BrowserRouter><BoxNavigationProvider>
    <Link to="/profile">Аккаунт</Link>
    <Routes>
      <Route path="/boxes" element={<Shelf />} />
      <Route path="/projects/p1/boxes/1" element={<Detail />} />
      <Route path="/profile" element={<h1>Профиль</h1>} />
    </Routes>
  </BoxNavigationProvider></BrowserRouter>)
}

beforeEach(() => {
  window.history.replaceState(null, '', '/boxes')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(api, 'getBox').mockResolvedValue(card)
  vi.spyOn(api, 'boxes').mockResolvedValue({ items: [card], total: 1, page: 1, page_size: 200 })
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
  document.startViewTransition = undefined as unknown as typeof nativeTransition
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.startViewTransition = nativeTransition })

describe('переход к коробке', () => {
  it('возвращается на последнюю страницу и сохраняет серверный фильтр комнаты', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Запомнить страницу 9' }))
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }))
    await screen.findByRole('heading', { name: 'Кухня' })
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await screen.findByRole('link', { name: 'Коробка 001' })
    expect(api.boxes).toHaveBeenCalledWith('p1', { page: 9, page_size: 36, room: 'Кухня' })
    expect(screen.getByText('Страница 9')).toBeTruthy()
  })

  it('ждёт данные перед уходом со стеллажа и передаёт их экрану коробки', async () => {
    let resolve!: (value: BoxCard) => void
    vi.mocked(api.getBox).mockReturnValue(new Promise((done) => { resolve = done }))
    setup()
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }))
    expect(screen.getByRole('link', { name: 'Коробка 001' }).getAttribute('aria-busy')).toBe('true')
    expect(window.location.pathname).toBe('/boxes')
    await act(async () => resolve(card))
    expect(await screen.findByRole('heading', { name: 'Кухня' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement?.id).toBe('box-heading'))
  })

  it('снимает новый кадр только после фактического обновления BrowserRouter', async () => {
    const snapshots: string[] = []
    const start = vi.fn((update: () => void | Promise<void>) => {
      const done = Promise.resolve().then(update).then(() => { snapshots.push(document.querySelector('main')?.textContent ?? screen.getByRole('heading').textContent ?? '') })
      return { ready: done, finished: done, updateCallbackDone: done, skipTransition: vi.fn() } as unknown as ViewTransition
    })
    document.startViewTransition = start as typeof nativeTransition
    setup()
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }))
    await waitFor(() => expect(snapshots).toEqual(['Кухня']))
    expect(start).toHaveBeenCalledTimes(1)
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('не уводит из аккаунта после запоздавшего ответа коробки', async () => {
    let resolve!: (value: BoxCard) => void
    vi.mocked(api.getBox).mockReturnValue(new Promise((done) => { resolve = done }))
    setup()
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }))
    fireEvent.click(screen.getByRole('link', { name: 'Аккаунт' }))
    await screen.findByRole('heading', { name: 'Профиль' })
    await act(async () => resolve(card))
    expect(window.location.pathname).toBe('/profile')
    expect(screen.getByRole('heading', { name: 'Профиль' })).toBeTruthy()
  })

  it('сохраняет переход, когда анимация отключена настройкой системы', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const start = vi.fn()
    document.startViewTransition = start
    setup()
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }))
    await screen.findByRole('heading', { name: 'Кухня' })
    expect(start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }))
    await screen.findByRole('link', { name: 'Коробка 001' })
    expect(window.location.pathname).toBe('/boxes')
  })

  it('оставляет модифицированный клик браузеру', () => {
    let prevented = true
    render(<BrowserRouter><BoxNavigationProvider><div onClick={(event) => { prevented = event.defaultPrevented; event.preventDefault() }}><BoxLink pid="p1" number={1}>Коробка 001</BoxLink></div></BoxNavigationProvider></BrowserRouter>)
    fireEvent.click(screen.getByRole('link', { name: 'Коробка 001' }), { ctrlKey: true })
    expect(prevented).toBe(false)
    expect(api.getBox).not.toHaveBeenCalled()
  })
})
