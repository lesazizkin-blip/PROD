import { parseBoxLink } from '../../ui/format'

export type QrMode = 'universal' | 'compact'
export type LabelTemplate = 'standard' | 'qr-only' | 'notes' | 'no-qr'
export interface ResolvedBox { project_id: string; box_number: number }

export const isCompactCode = (text: string) => /^MM1:[A-Z2-7]{16}$/.test(text.trim())

export function parseUniversalCode(text: string) {
  const link = parseBoxLink(text)
  if (!link || !Number.isSafeInteger(link.n)) return null
  try {
    if (!['http:', 'https:'].includes(new URL(text.trim(), window.location.origin).protocol)) return null
  } catch { return null }
  return link
}

export function isResolvedBox(value: unknown): value is ResolvedBox {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<ResolvedBox>
  return typeof result.project_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.project_id)
    && typeof result.box_number === 'number' && Number.isSafeInteger(result.box_number) && result.box_number >= 1
}
