import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoxCard } from '../../api/types'
import BoxAdvicePanel from './BoxAdvicePanel'

const { generate, auth } = vi.hoisted(() => ({ generate: vi.fn(), auth: { user: { id: 1, username: 'anna' } } }))
vi.mock('../../api/endpoints', () => ({ api: { boxAdvice: generate } }))
vi.mock('../../state/AuthContext', () => ({ useAuth: () => auth }))
let counter = 0
const boxFixture = (): BoxCard => ({
  number: 1, project_id: `advice-${++counter}`, room: 'Кухня', status: 'packing', fill_later: false, remind_at: null, items_count: 1,
  created_at: '2026-10-18T10:00:00Z', updated_at: '2026-10-18T10:00:00Z',
  items: [{ id: 7, box_number: 1, name: 'Чайник', quantity: 2, status: 'packed', first_day: true, lost: false, damaged: false, created_at: '2026-10-18T10:00:00Z' }],
})
const response = (b: BoxCard, tip = 'Защитите чайник мягкой прокладкой.') => ({
  basis: JSON.stringify(['Кухня', 'packing', [[7, b.items[0].name, b.items[0].quantity, true, false, false]]]), tips: [tip],
})
afterEach(cleanup)
beforeEach(() => { generate.mockReset(); auth.user = { id: 1, username: 'anna' } })

describe('Box advice', () => {
  it('only generates after click, ignores a repeated click while busy, reuses exact-inventory cache on return', async () => {
    const box = boxFixture()
    let resolve!: (v: ReturnType<typeof response>) => void
    generate.mockImplementation(() => new Promise(r => { resolve = r }))
    const view = render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    expect(generate).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Получить советы' })
    await userEvent.click(button)
    await userEvent.click(button)
    expect(generate).toHaveBeenCalledTimes(1)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await act(async () => resolve(response(box)))
    expect(await screen.findByText('Защитите чайник мягкой прокладкой.')).toBeTruthy()
    view.unmount()
    render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    expect(screen.getByText('Защитите чайник мягкой прокладкой.')).toBeTruthy()
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('hides an old response when inventory changes while generation is pending', async () => {
    const box = boxFixture(), next = { ...box, items: [{ ...box.items[0], name: 'Бокалы', quantity: 4 }] }
    let resolve!: (v: ReturnType<typeof response>) => void
    generate.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const view = render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    view.rerender(<BoxAdvicePanel box={next} disabled={false} onRefresh={vi.fn()} />)
    await act(async () => resolve(response(box)))
    expect(screen.queryByText('Защитите чайник мягкой прокладкой.')).toBeNull()
    expect(screen.getByText(/Опись или статус изменились/)).toBeTruthy()
    generate.mockResolvedValueOnce(response(next, 'Каждый бокал оберните отдельно.'))
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    expect(await screen.findByText('Каждый бокал оберните отдельно.')).toBeTruthy()
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('refreshes the card if the server generated advice from a newer inventory', async () => {
    const box = boxFixture(), next = { ...box, items: [{ ...box.items[0], quantity: 4 }] }, refresh = vi.fn()
    generate.mockResolvedValue(response(next))
    const view = render(<BoxAdvicePanel box={box} disabled={false} onRefresh={refresh} />)
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Защитите чайник мягкой прокладкой.')).toBeNull()
    view.rerender(<BoxAdvicePanel box={next} disabled={false} onRefresh={refresh} />)
    expect(await screen.findByText('Защитите чайник мягкой прокладкой.')).toBeTruthy()
  })

  it('shows failures only in the advice panel and allows retry', async () => {
    const box = boxFixture()
    generate.mockRejectedValueOnce(new Error('ИИ сейчас недоступен.'))
    generate.mockResolvedValueOnce(response(box))
    render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    expect(await screen.findByText('ИИ сейчас недоступен.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    expect(await screen.findByText('Защитите чайник мягкой прокладкой.')).toBeTruthy()
  })

  it('does not show previous-user results even when auth changes without unmounting', async () => {
    const box = boxFixture()
    generate.mockResolvedValue(response(box))
    const view = render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    await screen.findByText('Защитите чайник мягкой прокладкой.')
    auth.user = { id: 2, username: 'boris' }
    view.rerender(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    expect(screen.queryByText('Защитите чайник мягкой прокладкой.')).toBeNull()
  })

  it('does not offer generation for an empty box', () => {
    const box = boxFixture()
    render(<BoxAdvicePanel box={{ ...box, items: [] }} disabled={false} onRefresh={vi.fn()} />)
    expect(screen.getByText(/Добавьте вещи в опись/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(generate).not.toHaveBeenCalled()
  })

  it('renders model text as text instead of HTML', async () => {
    const box = boxFixture(), text = '<img src=x onerror=alert(1)>'
    generate.mockResolvedValue(response(box, text))
    const view = render(<BoxAdvicePanel box={box} disabled={false} onRefresh={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Получить советы' }))
    expect(await screen.findByText(text)).toBeTruthy()
    expect(view.container.querySelector('img')).toBeNull()
  })
})
