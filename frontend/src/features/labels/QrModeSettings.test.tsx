import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import QrModeSettings from './QrModeSettings'

const state = vi.hoisted(() => ({ role: 'owner', mode: 'universal', update: vi.fn() }))
vi.mock('../../state/ProjectContext', () => ({ useProjects: () => ({ projects: [{ id: 'p', role: state.role }] }) }))
vi.mock('../../api/endpoints', () => ({ api: {
  getProject: async () => ({ id: 'p', qr_mode: state.mode }),
  updateProject: (...args: unknown[]) => state.update(...args),
} }))
beforeEach(() => { state.mode = 'universal'; state.role = 'owner'; state.update.mockReset() })
afterEach(cleanup)

describe('QR setting shared by the project', () => {
  it('owner saves through API and refreshes labels', async () => {
    const onSaved = vi.fn()
    state.update.mockImplementation(async (_pid, value) => { state.mode = value.qr_mode })
    render(<QrModeSettings pid="p" onSaved={onSaved} />)
    const select = await screen.findByLabelText('Способ сканирования')
    fireEvent.change(select, { target: { value: 'compact' } })
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(state.update).toHaveBeenCalledWith('p', { qr_mode: 'compact' })
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe('compact'))
  })

  it('members can read but cannot edit the shared mode', async () => {
    state.role = 'member'
    render(<QrModeSettings pid="p" onSaved={vi.fn()} />)
    expect((await screen.findByLabelText('Способ сканирования') as HTMLSelectElement).disabled).toBe(true)
    expect(state.update).not.toHaveBeenCalled()
  })

  it('a rejected save keeps the existing value and displays the error', async () => {
    state.update.mockRejectedValue(new ApiError('Нет связи', 0))
    const onSaved = vi.fn()
    render(<QrModeSettings pid="p" onSaved={onSaved} />)
    const select = await screen.findByLabelText('Способ сканирования')
    fireEvent.change(select, { target: { value: 'compact' } })
    await screen.findByText('Нет связи')
    expect((select as HTMLSelectElement).value).toBe('universal')
    expect(onSaved).not.toHaveBeenCalled()
  })
})
