import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorMessage, request } from './client'

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

// Ждёт отказ запроса и возвращает ошибку (тест падает, если запрос неожиданно удался)
const failure = (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error('ожидалась ошибка запроса')
    },
    (e: ApiError) => e,
  )

describe('request', () => {
  it('ходит на /api того же origin и разбирает JSON', async () => {
    const fetchMock = mockFetch(async () => json({ ok: 1 }))
    await expect(request('GET', '/health')).resolves.toEqual({ ok: 1 })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/health')
  })

  it('собирает query и пропускает пустые значения', async () => {
    const fetchMock = mockFetch(async () => json({}))
    await request('GET', '/search', { query: { q: 'чайник 1', page: 2, empty: '', none: undefined, flag: false } })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/search?q=%D1%87%D0%B0%D0%B9%D0%BD%D0%B8%D0%BA%201&page=2&flag=false')
  })

  it('отправляет тело как JSON', async () => {
    const fetchMock = mockFetch(async () => json({}))
    await request('POST', '/projects', { body: { name: 'x' } })
    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"x"}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('204 возвращает пустой результат', async () => {
    mockFetch(async () => new Response(null, { status: 204 }))
    await expect(request('DELETE', '/x')).resolves.toBeUndefined()
  })

  it('409 и 422: сообщение, код и ошибки полей из формата бэкенда', async () => {
    mockFetch(async () => json({ detail: 'Некорректные данные', code: 'validation_failed', request_id: 'r1', errors: [{ field: 'name', message: 'пусто' }] }, 422))
    const e = await failure(request('POST', '/projects'))
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 422, code: 'validation_failed', message: 'Некорректные данные', requestId: 'r1', fieldErrors: { name: 'пусто' } })
  })

  it('502 с HTML от nginx: понятный текст вместо «Ошибка 502»', async () => {
    mockFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }))
    const e = await failure(request('GET', '/x'))
    expect(e.message).toBe('Сервер временно недоступен. Попробуйте через минуту.')
    expect(e.status).toBe(502)
  })

  it('прочие ошибки без тела: «Ошибка N»', async () => {
    mockFetch(async () => new Response('', { status: 500 }))
    expect((await failure(request('GET', '/x'))).message).toBe('Ошибка 500')
  })

  it('нет сети: код network и понятное сообщение', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const e = await failure(request('GET', '/x'))
    expect(e).toMatchObject({ status: 0, code: 'network' })
    expect(e.message).toContain('Нет связи с сервером')
  })
})

describe('errorMessage', () => {
  it('для любых значений возвращает строку', () => {
    expect(errorMessage(new ApiError('Нельзя', 409))).toBe('Нельзя')
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('что-то')).toBe('Что-то пошло не так')
  })
})
