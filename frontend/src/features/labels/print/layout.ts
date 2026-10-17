import type { Label } from '../../../api/types'
import type { LabelTemplate } from '../contract'

// Print-local settings. Shared QR/API contracts belong to the integrator.
export type PrintTemplate = LabelTemplate
export const TEMPLATES: Record<PrintTemplate, string> = {
  standard: 'Стандарт: номер, комната и QR',
  'qr-only': 'Только QR', notes: 'Для заметок', 'no-qr': 'Без QR',
}
export const PRESETS = {
  '4': { title: '4 крупных · 93 × 135,5 мм', rows: 2, height: 135.5, qr: 40, maxQr: 56 },
  '8': { title: '8 средних · 93 × 64,75 мм', rows: 4, height: 64.75, qr: 34, maxQr: 40 },
  '12': { title: '12 компактных · 93 × 41,17 мм', rows: 6, height: (247 / 6), qr: 28, maxQr: 28 },
} as const
export type Preset = keyof typeof PRESETS
export const QR_SIZES = [24, 28, 34, 40, 48, 56]
export function readSettings(params: URLSearchParams) {
  const rawTemplate = params.get('template') ?? 'standard'
  const template: PrintTemplate = Object.hasOwn(TEMPLATES, rawTemplate) ? rawTemplate as PrintTemplate : 'standard'
  const rawPreset = params.get('layout') ?? '8'
  const preset: Preset = Object.hasOwn(PRESETS, rawPreset) ? rawPreset as Preset : '8'
  const rawCopies = Number(params.get('copies') ?? 1)
  const copies = Number.isInteger(rawCopies) && rawCopies >= 1 && rawCopies <= 20 ? rawCopies : 1
  const rawQr = Number(params.get('qr'))
  const qr = QR_SIZES.includes(rawQr) && rawQr <= PRESETS[preset].maxQr ? rawQr : PRESETS[preset].qr
  return { template, preset, copies, qr, writing: params.get('writing') === '1' }
}
export function paginateLabels(labels: Label[], copies: number, capacity: number): Label[][] {
  const pages: Label[][] = []
  for (const label of labels) {
    for (let copy = 0; copy < copies; copy++) {
      if (!pages.length || pages[pages.length - 1].length === capacity) pages.push([])
      pages[pages.length - 1].push(label)
    }
  }
  return pages
}
