import { request } from "./client"
import type {
  AppEvent, Box, ChecklistApplied, ChecklistFlags, ChecklistSuggestion, BoxCard, BoxCreate, BoxFilters, BoxStatus, BoxUpdate, FirstDayItem, Health, Hint, Item,
  Credentials, InviteInfo, InviteOut, Member, Label, LostItem, Page, PageParams, Progress, Project, ProjectBrief, ProjectCreate, ProjectUpdate, Reminder, SearchHit, User,
  Stage, Task, TaskCreate, TaskTemplate, TaskUpdate, Tip, TipTopic,
} from "./types"

// Все пути — по docs/API.md. Проект выбирается UUID {pid}, коробка — номером {n}.

const p = (pid: string) => `/projects/${pid}`

export const api = {
  // Служебные
  health: () => request<Health>("GET", "/health"),
  taskTemplates: () => request<TaskTemplate[]>("GET", "/task-templates"),
  tips: (topic?: TipTopic) => request<Tip[]>("GET", "/tips", { query: { topic } }),

  // Вход: сессия в httpOnly-cookie, браузер отправляет её сам
  me: () => request<User>("GET", "/auth/me"),
  register: (body: Credentials) => request<User>("POST", "/auth/register", { body }),
  login: (body: Credentials) => request<User>("POST", "/auth/login", { body }),
  demoLogin: () => request<User>("POST", "/auth/demo"),
  logout: () => request<void>("POST", "/auth/logout"),
  changePassword: (body: { current_password: string; new_password: string }) =>
    request<User>("POST", "/auth/password", { body }),

  // Приглашения
  createInvite: (pid: string) => request<InviteOut>("POST", `${p(pid)}/invites`),
  inviteInfo: (token: string) => request<InviteInfo>("GET", `/invites/${encodeURIComponent(token)}`),
  acceptInvite: (token: string) => request<Project>("POST", `/invites/${encodeURIComponent(token)}/accept`),
  revokeInvites: (pid: string) => request<{ revoked: number }>("DELETE", `${p(pid)}/invites`),
  members: (pid: string) => request<Member[]>("GET", `${p(pid)}/members`),
  removeMember: (pid: string, userId: number) =>
    request<void>("DELETE", `${p(pid)}/members/${userId}`, { query: { confirm: true } }),

  // Проекты
  myProjects: () => request<ProjectBrief[]>("GET", "/projects"),
  createProject: (body: ProjectCreate) => request<Project>("POST", "/projects", { body }),
  getProject: (pid: string) => request<Project>("GET", p(pid)),
  updateProject: (pid: string, body: ProjectUpdate) => request<Project>("PATCH", p(pid), { body }),
  deleteProject: (pid: string) => request<void>("DELETE", p(pid), { query: { confirm: true } }),

  // Задачи
  tasks: (pid: string, filters: { stage?: Stage; done?: boolean } = {}) =>
    request<Task[]>("GET", `${p(pid)}/tasks`, { query: filters }),
  createTask: (pid: string, body: TaskCreate) => request<Task>("POST", `${p(pid)}/tasks`, { body }),
  updateTask: (pid: string, tid: number, body: TaskUpdate) =>
    request<Task>("PATCH", `${p(pid)}/tasks/${tid}`, { body }),
  deleteTask: (pid: string, tid: number) =>
    request<void>("DELETE", `${p(pid)}/tasks/${tid}`, { query: { confirm: true } }),
  applyTemplates: (pid: string) => request<{ added: number }>("POST", `${p(pid)}/tasks/apply-templates`),

  // Коробки
  boxes: (pid: string, filters: BoxFilters = {}) =>
    request<Page<Box>>("GET", `${p(pid)}/boxes`, { query: { ...filters } }),
  createBox: (pid: string, body: BoxCreate) => request<Box>("POST", `${p(pid)}/boxes`, { body }),
  getBox: (pid: string, n: number) => request<BoxCard>("GET", `${p(pid)}/boxes/${n}`),
  updateBox: (pid: string, n: number, body: BoxUpdate) =>
    request<Box>("PATCH", `${p(pid)}/boxes/${n}`, { body }),
  deleteBox: (pid: string, n: number) =>
    request<void>("DELETE", `${p(pid)}/boxes/${n}`, { query: { confirm: true } }),
  transition: (pid: string, n: number, to: BoxStatus) =>
    request<Box>("POST", `${p(pid)}/boxes/${n}/transitions`, { body: { to } }),
  bulkTransition: (pid: string, numbers: number[], to: BoxStatus) =>
    request<{ updated: Box[] }>("POST", `${p(pid)}/boxes/bulk-transitions`, { body: { numbers, to } }),

  // Вещи
  items: (pid: string, n: number, params: PageParams = {}) =>
    request<Page<Item>>("GET", `${p(pid)}/boxes/${n}/items`, { query: { ...params } }),
  createItem: (pid: string, n: number, name: string) =>
    request<Item>("POST", `${p(pid)}/boxes/${n}/items`, { body: { name } }),
  createItemsBulk: (pid: string, n: number, text: string) =>
    request<{ created: Item[] }>("POST", `${p(pid)}/boxes/${n}/items/bulk`, { body: { text } }),
  updateItem: (pid: string, id: number, body: { name?: string; lost?: boolean }) =>
    request<Item>("PATCH", `${p(pid)}/items/${id}`, { body }),
  deleteItem: (pid: string, id: number) =>
    request<void>("DELETE", `${p(pid)}/items/${id}`, { query: { confirm: true } }),
  lostItems: (pid: string) => request<LostItem[]>("GET", `${p(pid)}/items/lost`),
  hints: (pid: string, id: number) => request<Hint[]>("GET", `${p(pid)}/items/${id}/hints`),

  // Поиск и этикетки
  search: (pid: string, q: string, params: PageParams = {}) =>
    request<Page<SearchHit>>("GET", `${p(pid)}/search`, { query: { q, ...params } }),
  label: (pid: string, n: number) => request<Label>("GET", `${p(pid)}/boxes/${n}/label`),
  labels: (pid: string, numbers?: number[]) =>
    request<Label[]>("GET", `${p(pid)}/labels`, { query: { numbers: numbers?.join(",") } }),

  // Контроль
  progress: (pid: string) => request<Progress>("GET", `${p(pid)}/progress`),
  reminders: (pid: string) => request<Reminder[]>("GET", `${p(pid)}/reminders`),
  firstDay: (pid: string) => request<FirstDayItem[]>("GET", `${p(pid)}/first-day`),
  createFirstDay: (pid: string, title: string) =>
    request<FirstDayItem>("POST", `${p(pid)}/first-day`, { body: { title } }),
  updateFirstDay: (pid: string, id: number, body: { done?: boolean; title?: string }) =>
    request<FirstDayItem>("PATCH", `${p(pid)}/first-day/${id}`, { body }),
  deleteFirstDay: (pid: string, id: number) =>
    request<void>("DELETE", `${p(pid)}/first-day/${id}`, { query: { confirm: true } }),
  events: (pid: string, params: PageParams & { type?: string } = {}) =>
    request<Page<AppEvent>>("GET", `${p(pid)}/events`, { query: { ...params } }),

  // Умный чек-лист (локальные правила)
  suggestChecklist: (pid: string, flags: ChecklistFlags) =>
    request<ChecklistSuggestion>('POST', `${p(pid)}/assistant/checklist`, { body: flags }),
  applyChecklist: (pid: string, flags: ChecklistFlags) =>
    request<ChecklistApplied>('POST', `${p(pid)}/assistant/checklist/apply`, { body: flags }),
}
