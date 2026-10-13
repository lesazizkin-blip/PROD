import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, isAbort, setUnauthorizedHandler, tokenStore } from './api'

const reply = (status: number, body: unknown, asJson = true) =>
  new Response(asJson ? JSON.stringify(body) : String(body), { status })

beforeEach(() => {
  localStorage.clear()
  setUnauthorizedHandler(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('подставляет токен и разбирает успешный ответ', async () => {
    tokenStore.set('abc')
    const fetchMock = vi.fn().mockResolvedValue(reply(200, { id: 1, email: 'a@b.c' }))
    vi.stubGlobal('fetch', fetchMock)
    const me = await api.me()
    expect(me).toMatchObject({ id: 1 })
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer abc')
  })

  it('раскладывает ошибки валидации по полям и сохраняет request_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        reply(422, { detail: 'Некорректные данные', errors: [{ field: 'title', message: 'мало' }], request_id: 'r1' }),
      ),
    )
    const err = await api.createItem({ title: 'a', description: '', amount: 0 }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.fields).toEqual([{ field: 'title', message: 'мало' }])
    expect(err.requestId).toBe('r1')
  })

  it('401 при наличии токена вызывает выход, без токена (неверный пароль) - нет', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(reply(401, { detail: 'нет' }))))
    await api.login({ email: 'a@b.c', password: 'x' }).catch(() => {})
    expect(onUnauthorized).not.toHaveBeenCalled()
    tokenStore.set('old')
    await api.me().catch(() => {})
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('HTML-ответ шлюза (502) превращается в понятное сообщение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(502, '<html>Bad Gateway</html>', false)))
    const err = await api.me().catch((e) => e)
    expect(err.message).toContain('временно недоступен')
  })

  it('обрыв сети даёт ApiError со статусом 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const err = await api.me().catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
  })

  it('отмена вызывающим кодом не превращается в ошибку для пользователя', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
      ),
    )
    const ctrl = new AbortController()
    const pending = api.getItem(1, ctrl.signal).catch((e) => e)
    ctrl.abort()
    expect(isAbort(await pending)).toBe(true)
  })

  it('не падает, если localStorage недоступен', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(tokenStore.get()).toBeNull()
    vi.restoreAllMocks()
  })
})
