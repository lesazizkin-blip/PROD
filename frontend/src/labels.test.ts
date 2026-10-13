import { describe, expect, it } from 'vitest'
import { COMMENT_REQUIRED, availableActions, formatMoney } from './labels'

describe('availableActions', () => {
  it('автор может отправить черновик и запись, возвращённую на доработку', () => {
    expect(availableActions('draft', true, false)).toEqual(['submit'])
    expect(availableActions('changes_requested', true, false)).toEqual(['submit'])
  })

  it('администратор решает только по записи «на согласовании»', () => {
    expect(availableActions('in_review', false, true)).toEqual(['approve', 'request_changes', 'reject'])
    expect(availableActions('draft', false, true)).toEqual([])
  })

  it('чужой пользователь и финальные статусы не дают действий', () => {
    expect(availableActions('draft', false, false)).toEqual([])
    expect(availableActions('approved', true, true)).toEqual([])
    expect(availableActions('rejected', true, true)).toEqual([])
  })

  it('комментарий обязателен при отклонении и возврате на доработку', () => {
    expect(COMMENT_REQUIRED).toEqual(['reject', 'request_changes'])
  })
})

describe('formatMoney', () => {
  it('разделяет тысячи и добавляет знак рубля', () => {
    expect(formatMoney(50000).replace(/\s/g, ' ')).toBe('50 000 ₽')
  })
})
