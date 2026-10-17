import type { BoxStatus, ItemStatus, Stage } from '../api/types'
import { BOX_STATUSES } from '../api/types'

export const STATUS_LABELS: Record<BoxStatus, string> = {
  packing: 'Собирается',
  packed: 'Собрана',
  loaded: 'Погружена',
  delivered: 'Доставлена',
  unpacked: 'Распакована',
}

export const BOX_STATUS_HINTS: Record<BoxStatus, string> = {
  packing: 'Ещё складываем вещи',
  packed: 'Заклеена, ждёт погрузки',
  loaded: 'В машине',
  delivered: 'На новом месте',
  unpacked: 'Вещи разложены',
}

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  packed: 'Упакована',
  unpacked: 'Распакована',
  found: 'Найдена',
  lost: 'Потеряна',
  damaged: 'Повреждена',
}

export const ITEM_STATUS_HINTS: Record<ItemStatus, string> = {
  packed: 'Лежит в коробке',
  unpacked: 'Достали, вещь на месте',
  found: 'Была потеряна и нашлась',
  lost: 'Не можем найти: подскажем, где искать',
  damaged: 'Пострадала при переезде',
}

export const STAGE_LABELS: Record<Stage, string> = {
  before: 'До переезда',
  moving_day: 'День переезда',
  after: 'После переезда',
}

export const STAGES: Stage[] = ['before', 'moving_day', 'after']

/** Следующий статус вперёд (null, если коробка уже распакована). */
export const nextStatus = (s: BoxStatus): BoxStatus | null => BOX_STATUSES[BOX_STATUSES.indexOf(s) + 1] ?? null
export const prevStatus = (s: BoxStatus): BoxStatus | null => BOX_STATUSES[BOX_STATUSES.indexOf(s) - 1] ?? null

/** Можно ли сменить статус коробки (как на сервере: на любой другой, шаги можно пропускать). */
export const canTransition = (from: BoxStatus, to: BoxStatus): boolean => from !== to

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Путь карточки коробки в приложении: его же кодирует QR (с адресом сайта впереди). */
export const boxPath = (pid: string, n: number) => `/projects/${pid}/boxes/${n}`

/** Путь этикетки коробки (крупный номер и QR на экране телефона). */
export const labelPath = (pid: string, n: number) => `${boxPath(pid, n)}/label`

/** Ссылка, которую кодирует QR на этикетке: обычный URL сайта, её открывает любая камера. */
export const boxUrl = (qrPath: string, origin: string = window.location.origin) => `${origin}${qrPath}`

/**
 * Разбор отсканированного текста. Принимает ссылку на карточку коробки с любым адресом сайта
 * (этикетку могли напечатать при запуске на другом домене) и возвращает путь внутри приложения.
 * Всё остальное (чужие ссылки, мусор) отклоняется.
 */
export function parseBoxLink(text: string): { pid: string; n: number } | null {
  let pathname: string
  try {
    pathname = new URL(text.trim(), 'http://localhost').pathname
  } catch {
    return null
  }
  const m = pathname.match(/^\/projects\/([0-9a-f-]{36})\/boxes\/(\d+)\/?$/i)
  if (!m) return null
  const n = Number(m[2])
  return n >= 1 ? { pid: m[1].toLowerCase(), n } : null
}

/** Склонение по числу: plural(1, ['вещь', 'вещи', 'вещей']) -> «вещь», 2 -> «вещи», 5 -> «вещей». */
export function plural(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}

/** Время задачи для показа: «09:00–12:30», «с 09:00», «до 12:30» (сервер отдаёт ЧЧ:ММ:СС). */
export function formatTimeRange(start: string | null, end: string | null): string {
  const a = start?.slice(0, 5)
  const b = end?.slice(0, 5)
  if (a && b) return `${a}–${b}`
  if (a) return `с ${a}`
  if (b) return `до ${b}`
  return ''
}
