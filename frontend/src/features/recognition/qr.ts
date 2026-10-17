import { ApiError, request } from '../../api/client'
import { parseBoxLink } from '../../ui/format'
import type { ResolveCode } from './number'

export const isCompactCode = (text: string) => /^MM1:[A-Z2-7]{16}$/.test(text.trim())
export function parseUniversalCode(text: string) {
  const link = parseBoxLink(text)
  if (!link || !Number.isSafeInteger(link.n)) return null
  try {
    if (!['http:', 'https:'].includes(new URL(text.trim(), window.location.origin).protocol)) return null
  } catch { return null }
  return link
}
/** Enable only after the integrator verifies backend availability. No production mocks. */
export const resolveCompactCode: ResolveCode = async (code) => {
  if (!isCompactCode(code)) throw new Error('Неверный формат компактного QR.')
  const result = await request<{ project_id: string; box_number: number }>('POST', '/boxes/resolve-code', { body: { code: code.trim() } })
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.project_id)
    || !Number.isSafeInteger(result.box_number) || result.box_number < 1) throw new Error('Сервер вернул некорректную ссылку на коробку.')
  return result
}
export function lookupMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Войдите, чтобы открыть коробку.'
    if (error.status === 403) return 'Нет доступа к этому проекту.'
    if (error.status === 404) return 'Коробка не найдена или недоступна вашему аккаунту.'
    if (error.status === 0) return error.message
  }
  return error instanceof Error ? error.message : 'Не удалось проверить коробку. Попробуйте снова.'
}
