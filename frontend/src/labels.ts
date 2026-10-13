import type { Action, Status } from './types'

export const STATUS_LABEL: Record<Status, string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  changes_requested: 'Нужны правки',
  approved: 'Согласовано',
  rejected: 'Отклонено',
}

export const ACTION_LABEL: Record<Action, string> = {
  submit: 'Отправить на согласование',
  approve: 'Согласовать',
  reject: 'Отклонить',
  request_changes: 'Вернуть на доработку',
}

export const EVENT_LABEL: Record<string, string> = {
  create: 'Создано',
  update: 'Изменено автором',
  ...ACTION_LABEL,
}

// Какие действия показываем (повторяет правила бэкенда; финальное решение всегда за сервером)
export function availableActions(status: Status, isOwner: boolean, isAdmin: boolean): Action[] {
  const actions: Action[] = []
  if (isOwner && (status === 'draft' || status === 'changes_requested')) actions.push('submit')
  if (isAdmin && status === 'in_review') actions.push('approve', 'request_changes', 'reject')
  return actions
}

export const COMMENT_REQUIRED: Action[] = ['reject', 'request_changes']

export const formatMoney = (n: number) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽'
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
