import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MembersPanel from './MembersPanel'

const members = vi.fn()
const removeMember = vi.fn()
const revokeInvites = vi.fn()
vi.mock('../api/endpoints', () => ({
  api: {
    members: (...a: unknown[]) => members(...a),
    removeMember: (...a: unknown[]) => removeMember(...a),
    revokeInvites: (...a: unknown[]) => revokeInvites(...a),
    createInvite: () => Promise.resolve({ token: 't', path: '/invite/t', expires_at: '2026-10-23' }),
  },
}))

const LIST = [
  { user_id: 1, username: 'anna', role: 'owner' },
  { user_id: 2, username: 'boris', role: 'member' },
]

beforeEach(() => {
  members.mockReset().mockResolvedValue(LIST)
  removeMember.mockReset().mockResolvedValue(undefined)
  revokeInvites.mockReset().mockResolvedValue({ revoked: 2 })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(cleanup)

describe('помощники', () => {
  it('владелец видит участников, убирает участника и отзывает ссылки', async () => {
    render(<MembersPanel project={{ id: 'p', name: 'Переезд', role: 'owner' }} me={{ id: 1, username: 'anna' }} onLeft={vi.fn()} />)
    expect(await screen.findByText('boris')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Убрать' }))
    expect(removeMember).toHaveBeenCalledWith('p', 2)
    await userEvent.click(screen.getByRole('button', { name: 'Отозвать все ссылки' }))
    expect(await screen.findByText('Отозвано ссылок: 2')).toBeTruthy()
  })

  it('участник может только выйти сам, приглашать не может', async () => {
    const onLeft = vi.fn()
    render(<MembersPanel project={{ id: 'p', name: 'Переезд', role: 'member' }} me={{ id: 2, username: 'boris' }} onLeft={onLeft} />)
    await screen.findByText('anna')
    expect(screen.queryByRole('button', { name: 'Пригласить по ссылке' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Убрать' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Выйти из проекта' }))
    await waitFor(() => expect(onLeft).toHaveBeenCalled())
    expect(removeMember).toHaveBeenCalledWith('p', 2)
  })
})
