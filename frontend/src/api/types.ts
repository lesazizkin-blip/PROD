// Типы по docs/API.md. При расхождении с Swagger (/api/docs) правим здесь и в API.md.
import type { QrMode } from '../features/labels/contract'

export type Stage = "before" | "moving_day" | "after"

export type BoxStatus = "packing" | "packed" | "loaded" | "delivered" | "unpacked"

export const BOX_STATUSES: BoxStatus[] = ["packing", "packed", "loaded", "delivered", "unpacked"]

/** Состояние вещи: выбирается свободно, в любом порядке */
export type ItemStatus = "packed" | "unpacked" | "lost" | "found" | "damaged"

export const ITEM_STATUSES: ItemStatus[] = ["packed", "unpacked", "found", "lost", "damaged"]

export type TipTopic = "fragile" | "carry_with_you" | "pack_last"

export type HintReason = "recorded" | "similar_content" | "same_room"

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface User {
  id: number
  username: string
}

export interface Credentials {
  username: string
  password: string
}

/** Проект в списке «Мои проекты»: роль показывает, можно ли приглашать и удалять */
export interface ProjectBrief {
  id: string
  name: string
  move_date: string
  role: 'owner' | 'member'
}

export interface Member {
  user_id: number
  username: string
  role: 'owner' | 'member'
}

export interface InviteOut {
  token: string
  path: string
  expires_at: string
}

export interface InviteInfo {
  project_name: string
  expires_at: string
}

export interface Project {
  qr_mode?: QrMode
  id: string
  name: string
  move_date: string
  address_from: string | null
  address_to: string | null
  created_at: string
}

export interface Task {
  id: number
  project_id: string
  stage: Stage
  title: string
  due_date: string | null
  start_time: string | null
  end_time: string | null
  category: string | null
  category_color: string | null
  assignee: string | null
  done: boolean
  done_at: string | null
  template_id: number | null
}

export interface TaskTemplate {
  id: number
  stage: Stage
  title: string
  default_offset_days: number
}

export interface Box {
  number: number
  project_id: string
  room: string
  status: BoxStatus
  fill_later: boolean
  remind_at: string | null
  items_count: number
  created_at: string
  updated_at: string
}

export interface BoxCard extends Box {
  items: Item[]
}

export interface Item {
  id: number
  box_number: number
  name: string
  status: ItemStatus
  /** то же, что status === "lost" */
  lost: boolean
  /** понадобится в первый день на новом месте */
  first_day: boolean
  created_at: string
}

export interface SearchHit {
  item_id: number
  name: string
  item_status: ItemStatus
  lost: boolean
  box_number: number
  room: string
  status: BoxStatus
}

export interface LostItem {
  item: Item
  box_number: number
  room: string
  status: BoxStatus
}

export interface Hint {
  box_number: number
  room: string
  status: BoxStatus
  reason: HintReason
  score: number
}

export interface Label {
  /** Optional until the compact QR backend contract is deployed. */
  qr_payload?: string | null
  number: number
  room: string
  project_name: string
  qr_path: string
  items_preview: string[]
}

export type StatusCounts = Record<BoxStatus, number>

export interface RoomProgress {
  room: string
  total: number
  by_status: StatusCounts
  loaded: number
  loaded_percent: number
  unpacked: number
  unpacked_percent: number
}

export interface Progress {
  boxes_total: number
  by_status: StatusCounts
  unpacked_percent: number
  rooms: RoomProgress[]
  coverage: number
}

export interface Reminder {
  box: Box
  overdue: boolean
}

export interface FirstDayItem {
  id: number
  title: string
  done: boolean
}

export interface Tip {
  id: number
  topic: TipTopic
  title: string
  body: string
}

export interface AppEvent {
  id: number
  type: string
  entity: string
  entity_id: string
  data: Record<string, unknown>
  created_at: string
}

export interface Health {
  status: string
  db: string
  version: string
}

// Запросы

export interface ProjectCreate {
  plan_mode?: "standard" | "empty"
  first_day?: string[]
  qr_mode?: QrMode
  personal_plan?: import('../features/planner/types').PersonalPlan
  name: string
  move_date: string
  address_from?: string | null
  address_to?: string | null
}

export type ProjectUpdate = Partial<Omit<ProjectCreate, 'personal_plan' | 'plan_mode' | 'first_day'>>

export interface TaskCreate {
  stage: Stage
  title: string
  due_date?: string | null
  start_time?: string | null
  end_time?: string | null
  category?: string | null
  category_color?: string | null
  assignee?: string | null
}

export type TaskUpdate = Partial<TaskCreate> & { done?: boolean }

export interface BoxCreate {
  room: string
  fill_later?: boolean
  remind_at?: string | null
  items_text?: string | null
}

export interface BoxUpdate {
  room?: string
  fill_later?: boolean
  remind_at?: string | null
}

export interface BoxFilters {
  room?: string
  status?: BoxStatus
  fill_later?: boolean
  number?: number
  page?: number
  page_size?: number
}

export interface PageParams {
  page?: number
  page_size?: number
}

// Ошибки: формат из backend/app/main.py
export interface ApiErrorBody {
  detail: string
  code: string
  request_id?: string
  errors?: { field: string; message: string }[]
}

// Умный чек-лист
export interface ChecklistFlags {
  with_children: boolean
  with_pets: boolean
  other_city: boolean
  // этапы полного пути переезда
  renting: boolean
  paperwork: boolean
  declutter: boolean
  settling: boolean
}

export interface ChecklistSuggestion {
  suggested_tasks: { stage: Stage; title: string; reason: keyof ChecklistFlags }[]
  suggested_first_day: string[]
}

export interface ChecklistApplied {
  added_tasks: number
  added_first_day: number
}

/** Фото-помощник: черновики модели, в проект попадают только после подтверждения */
export interface PhotoItem {
  name: string
  first_day: boolean
  fragile: boolean
}

export interface PhotoInventory {
  items: PhotoItem[]
}

export interface RoomBox {
  label: string
  items: string[]
  tip: string
}

export interface RoomPlan {
  room: string
  boxes: RoomBox[]
}

/** Полный путь переезда: калькулятор и бюджет «план–факт» */
export type ExpenseCategory = 'movers' | 'transport' | 'materials' | 'cleaning' | 'services' | 'rent' | 'other'

export interface CalculatorIn {
  rooms: number
  people: number
  distance_km: number
  floor_from: number
  floor_to: number
  elevator_from: boolean
  elevator_to: boolean
  pets: boolean
  piano: boolean
  many_fragile: boolean
  move_date?: string | null
  /** slug из GET /api/cities; пусто - средние цены по крупным городам */
  city?: string | null
}

export interface City {
  slug: string
  name: string
}

export interface Range {
  low: number
  high: number
}

export interface CostLine {
  category: ExpenseCategory
  title: string
  cost: Range
}

export interface CalculatorOut {
  boxes: Range
  volume_m3: Range
  vehicle: string
  movers: number
  hours: Range
  prep_weeks: number
  costs: CostLine[]
  total: Range
  date_advice: string[]
  assumptions: string
  city?: string | null
}

export interface Expense {
  id: number
  category: ExpenseCategory
  title: string
  planned: number
  actual: number | null
}

export interface Budget {
  items: Expense[]
  planned: number
  actual: number
  variance: number
}
