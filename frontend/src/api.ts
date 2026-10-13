import type { Action, FieldError, Item, ItemEvent, ItemList, Stats, Status, User } from './types'

const TOKEN_KEY = 'token'
const TIMEOUT_MS = 20_000

// localStorage бывает недоступен (приватный режим, запрет сайта): тогда работаем без запоминания входа
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(t: string) {
    try {
      localStorage.setItem(TOKEN_KEY, t)
    } catch {
      /* вход не запомнится после перезагрузки */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* нечего очищать */
    }
  },
}

export class ApiError extends Error {
  status: number
  fields: FieldError[]
  requestId?: string
  constructor(message: string, status: number, fields: FieldError[] = [], requestId?: string) {
    super(message)
    this.status = status
    this.fields = fields
    this.requestId = requestId
  }
}

// Запрос отменён вызывающим кодом (устаревший ответ, закрытый экран): это не ошибка для пользователя
export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

const GATEWAY_ERRORS = new Set([502, 503, 504])

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  // Свой контроллер: отмена вызывающего кода + таймаут (без него зависший бэкенд даёт вечный спиннер)
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, TIMEOUT_MS)
  const caller = init.signal
  if (caller) {
    if (caller.aborted) controller.abort()
    else caller.addEventListener('abort', () => controller.abort(), { once: true })
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers, signal: controller.signal })
  } catch (e) {
    if (isAbort(e) && !timedOut) throw e
    throw new ApiError(
      timedOut
        ? 'Сервер не ответил вовремя. Попробуйте ещё раз.'
        : 'Нет связи с сервером. Проверьте интернет и попробуйте снова.',
      0,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    // Прокси может отдать HTML вместо JSON (502 от nginx): показываем понятный текст, а не «Ошибка 502»
    const body = await res.json().catch(() => ({}))
    // Протухший токен на защищённых запросах -> выходим; на логине 401 - это просто "неверный пароль"
    if (res.status === 401 && token) onUnauthorized()
    throw new ApiError(
      body.detail ??
        (GATEWAY_ERRORS.has(res.status)
          ? 'Сервер временно недоступен. Попробуйте через минуту.'
          : `Ошибка ${res.status}`),
      res.status,
      body.errors ?? [],
      body.request_id,
    )
  }
  if (res.status === 204) return undefined as T
  try {
    return (await res.json()) as T
  } catch {
    throw new ApiError('Сервер вернул некорректный ответ.', res.status)
  }
}

const json = (data: unknown) => JSON.stringify(data)

export const api = {
  register: (data: { email: string; full_name: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: json(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: json(data) }),
  me: () => request<User>('/auth/me'),

  listItems: (
    p: { status?: Status | ''; q?: string; limit: number; offset: number },
    signal?: AbortSignal,
  ) => {
    const qs = new URLSearchParams({ limit: String(p.limit), offset: String(p.offset) })
    if (p.status) qs.set('status', p.status)
    if (p.q) qs.set('q', p.q)
    return request<ItemList>(`/items?${qs}`, { signal })
  },
  getItem: (id: number, signal?: AbortSignal) => request<Item>(`/items/${id}`, { signal }),
  createItem: (data: { title: string; description: string; amount: number }) =>
    request<Item>('/items', { method: 'POST', body: json(data) }),
  updateItem: (id: number, data: Partial<{ title: string; description: string; amount: number }>) =>
    request<Item>(`/items/${id}`, { method: 'PATCH', body: json(data) }),
  transition: (id: number, action: Action, comment?: string) =>
    request<Item>(`/items/${id}/transitions`, { method: 'POST', body: json({ action, comment }) }),
  events: (id: number, signal?: AbortSignal) => request<ItemEvent[]>(`/items/${id}/events`, { signal }),
  stats: (signal?: AbortSignal) => request<Stats>('/stats', { signal }),
}
