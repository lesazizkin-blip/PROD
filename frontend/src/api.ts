import type { Action, FieldError, Item, ItemEvent, ItemList, Stats, Status, User } from './types'

const TOKEN_KEY = 'token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
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

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = tokenStore.get()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetch(`/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте снова.', 0)
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    // Протухший токен на защищённых запросах -> выходим; на логине 401 - это просто "неверный пароль"
    if (res.status === 401 && token) onUnauthorized()
    throw new ApiError(
      body.detail ?? `Ошибка ${res.status}`,
      res.status,
      body.errors ?? [],
      body.request_id,
    )
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const json = (data: unknown) => JSON.stringify(data)

export const api = {
  register: (data: { email: string; full_name: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: json(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: json(data) }),
  me: () => request<User>('/auth/me'),

  listItems: (p: { status?: Status | ''; q?: string; limit: number; offset: number }) => {
    const qs = new URLSearchParams({ limit: String(p.limit), offset: String(p.offset) })
    if (p.status) qs.set('status', p.status)
    if (p.q) qs.set('q', p.q)
    return request<ItemList>(`/items?${qs}`)
  },
  createItem: (data: { title: string; description: string; amount: number }) =>
    request<Item>('/items', { method: 'POST', body: json(data) }),
  updateItem: (id: number, data: Partial<{ title: string; description: string; amount: number }>) =>
    request<Item>(`/items/${id}`, { method: 'PATCH', body: json(data) }),
  transition: (id: number, action: Action, comment?: string) =>
    request<Item>(`/items/${id}/transitions`, { method: 'POST', body: json({ action, comment }) }),
  events: (id: number) => request<ItemEvent[]>(`/items/${id}/events`),
  stats: () => request<Stats>('/stats'),
}
