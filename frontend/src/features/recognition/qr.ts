import { ApiError } from '../../api/client'
import { api } from '../../api/endpoints'
import type { ResolveCode } from './number'

export { isCompactCode, parseUniversalCode } from '../labels/contract'
/** Enable only after the integrator verifies backend availability. No production mocks. */
export const resolveCompactCode: ResolveCode = (code) => api.resolveBoxCode(code)
export function lookupMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Войдите, чтобы открыть коробку.'
    if (error.status === 403) return 'Нет доступа к этому проекту.'
    if (error.status === 404) return 'Коробка не найдена или недоступна вашему аккаунту.'
    if (error.status === 0) return error.message
  }
  return error instanceof Error ? error.message : 'Не удалось проверить коробку. Попробуйте снова.'
}
