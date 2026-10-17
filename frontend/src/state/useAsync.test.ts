import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAsync } from './useAsync'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('useAsync', () => {
  it('показывает подготовленные данные сразу и обновляет их ответом сервера', async () => {
    const response = deferred<string>()
    const { result } = renderHook(() => useAsync(() => response.promise, ['box'], { initialData: 'подготовленная коробка' }))
    expect(result.current.data).toBe('подготовленная коробка')
    expect(result.current.loading).toBe(true)
    await act(async () => response.resolve('актуальная коробка'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('актуальная коробка')
  })

  it('обновляет данные при возврате, объединяет focus/visibility и удаляет обработчики', async () => {
    const load = vi.fn().mockResolvedValue('данные')
    const { unmount } = renderHook(() => useAsync(load, [], { refreshOnFocus: true }))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    unmount()
    act(() => window.dispatchEvent(new Event('focus')))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('прячет данные прошлого проекта, пока грузится новый', async () => {
    const calls: Record<string, ReturnType<typeof deferred<string>>> = { a: deferred(), b: deferred() }
    const { result, rerender } = renderHook(({ pid }) => useAsync(() => calls[pid].promise, [pid]), { initialProps: { pid: 'a' } })
    await act(async () => calls.a.resolve('задачи A'))
    await waitFor(() => expect(result.current.data).toBe('задачи A'))

    rerender({ pid: 'b' })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)
    await act(async () => calls.b.resolve('задачи B'))
    await waitFor(() => expect(result.current.data).toBe('задачи B'))
  })

  it('reload оставляет текущие данные на экране', async () => {
    let n = 0
    const { result } = renderHook(() => useAsync(() => Promise.resolve(++n), ['same']))
    await waitFor(() => expect(result.current.data).toBe(1))
    act(() => result.current.reload())
    expect(result.current.data).toBe(1)
    await waitFor(() => expect(result.current.data).toBe(2))
  })
})
