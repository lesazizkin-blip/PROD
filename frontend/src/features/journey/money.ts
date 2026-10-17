import type { ExpenseCategory, Range } from '../../api/types'

/** 12500 -> «12 500 ₽» */
export const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`
export const rubRange = (r: Range) => (r.low === r.high ? rub(r.low) : `${rub(r.low)} – ${rub(r.high)}`)
export const mid = (r: Range) => Math.round((r.low + r.high) / 2 / 100) * 100

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  movers: 'Грузчики',
  transport: 'Транспорт',
  materials: 'Коробки и материалы',
  cleaning: 'Уборка',
  services: 'Услуги',
  rent: 'Жильё и залог',
  other: 'Другое',
}
