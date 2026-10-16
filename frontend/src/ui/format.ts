import type { BoxStatus, Stage } from '../api/types'
import { BOX_STATUSES } from '../api/types'

export const STATUS_LABELS: Record<BoxStatus, string> = {
  packing: 'Собирается',
  packed: 'Собрана',
  loaded: 'Погружена',
  delivered: 'Доставлена',
  unpacked: 'Распакована',
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

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

/** Путь карточки коробки в приложении: его же кодирует QR (с адресом сайта впереди). */
export const boxPath = (pid: string, n: number) => `/projects/${pid}/boxes/${n}`

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
