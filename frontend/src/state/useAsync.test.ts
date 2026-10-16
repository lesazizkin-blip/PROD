import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAsync } from './useAsync'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

describe('useAsync', () => {
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
