import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAction } from './useAction'

afterEach(cleanup)

describe('useAction', () => {
  it('второй клик во время запроса не отправляет действие повторно', async () => {
    let finish!: () => void
    const action = vi.fn(() => new Promise<void>((r) => { finish = r }))
    const onDone = vi.fn()
    const { result } = renderHook(() => useAction(onDone))

    let first!: Promise<void>
    act(() => { first = result.current.run(action) })
    expect(result.current.busy).toBe(true)
    await act(() => result.current.run(action))
    expect(action).toHaveBeenCalledTimes(1)

    await act(async () => { finish(); await first })
    expect(result.current.busy).toBe(false)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('ошибку сервера показывает и разблокирует кнопки', async () => {
    const { result } = renderHook(() => useAction())
    await act(() => result.current.run(() => Promise.reject(new Error('Нельзя'))))
    expect(result.current.error).toBe('Нельзя')
    expect(result.current.busy).toBe(false)
  })
})
