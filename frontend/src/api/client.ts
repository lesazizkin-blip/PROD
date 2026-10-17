import type { ApiErrorBody } from './types'

const TIMEOUT_MS = 20_000
export const UNAUTHORIZED_EVENT = 'movermate:unauthorized'
const GATEWAY_ERRORS = new Set([502, 503, 504])

export class ApiError extends Error {
  status: number
  code: string
  fieldErrors: Record<string, string>
  requestId?: string
  constructor(message: string, status: number, code = 'error', fieldErrors: Record<string, string> = {}, requestId?: string) {
    super(message)
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
    this.requestId = requestId
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

function buildUrl(path: string, query?: Query): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }
  return `/api${path}${parts.length ? `?${parts.join('&')}` : ''}`
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: { query?: Query; body?: unknown } = {},
): Promise<T> {
  // Свой контроллер с таймаутом: без него зависший бэкенд даёт вечный спиннер
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(
      timedOut ? 'Сервер не ответил вовремя. Попробуйте ещё раз.' : 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
      0,
      timedOut ? 'timeout' : 'network',
    )
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401 && !path.startsWith('/auth/')) {
    // Сессия кончилась или её нет: экран входа покажет AuthProvider, адрес страницы сохранится
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  if (!res.ok) {
    // Прокси может отдать HTML вместо JSON (502 от nginx): показываем понятный текст, а не «Ошибка 502»
    const body: Partial<ApiErrorBody> = await res.json().catch(() => ({}))
    const fields: Record<string, string> = {}
    for (const e of body.errors ?? []) fields[e.field] = e.message
    throw new ApiError(
      body.detail ?? (GATEWAY_ERRORS.has(res.status) ? 'Сервер временно недоступен. Попробуйте через минуту.' : `Ошибка ${res.status}`),
      res.status,
      body.code ?? 'http_error',
      fields,
      body.request_id,
    )
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Человекочитаемое сообщение для любой ошибки (для экранов и диалогов). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Что-то пошло не так'
}
