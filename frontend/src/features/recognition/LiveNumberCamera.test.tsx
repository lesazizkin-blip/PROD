import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveNumberCamera from './LiveNumberCamera'
import type { HandwritingResult } from './number'

const h = vi.hoisted(() => ({ getBox: vi.fn(), getUserMedia: vi.fn(), trackStop: vi.fn() }))
vi.mock('../../api/endpoints', () => ({ api: { getBox: h.getBox } }))
vi.mock('./guideFrame', () => ({ guideFrame: async () => new Blob(['frame']) }))
vi.mock('./locateNumber', () => ({ locateNumber: async () => [new Blob(['digits'])] }))

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: h.getUserMedia } })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  h.getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: h.trackStop }] })
  h.trackStop.mockReset(); h.getBox.mockReset().mockResolvedValue({ room: 'Кухня' })
})
afterEach(async () => { cleanup(); await act(async () => { await Promise.resolve() }); vi.restoreAllMocks() })

describe('automatic number camera', () => {
  it('waits for consecutive agreement, checks the real box adapter and requires explicit opening', async () => {
    const recognize = vi.fn().mockResolvedValue({ text: '001', candidates: ['001'], diagnostics: { engine: 'test', elapsedMs: 0 } })
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<LiveNumberCamera pid="p" recognize={recognize} onConfirm={onConfirm} />)
    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(1))
    expect(h.getBox).not.toHaveBeenCalled()
    const open = await screen.findByRole('button', { name: 'Открыть коробку #001' }, { timeout: 3000 })
    expect(h.getBox).toHaveBeenCalledWith('p', 1)
    expect(onConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(h.trackStop).toHaveBeenCalledTimes(1))
    fireEvent.click(open)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(1))
  })

  it('releases a camera whose permission resolves after leaving the page', async () => {
    let release!: (stream: unknown) => void
    h.getUserMedia.mockReturnValue(new Promise(resolve => { release = resolve }))
    const recognize = vi.fn()
    const { unmount } = render(<LiveNumberCamera pid="p" recognize={recognize} onConfirm={vi.fn()} />)
    await waitFor(() => expect(h.getUserMedia).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => release({ getTracks: () => [{ stop: h.trackStop }] }))
    await waitFor(() => expect(h.trackStop).toHaveBeenCalledTimes(1))
    expect(recognize).not.toHaveBeenCalled()
  })
  it('does not publish a late OCR result after leaving the page', async () => {
    let release!: (result: HandwritingResult) => void
    const recognize = vi.fn(() => new Promise<HandwritingResult>(resolve => { release = resolve }))
    const onConfirm = vi.fn()
    const { unmount } = render(<LiveNumberCamera pid="p" recognize={recognize} onConfirm={onConfirm} />)
    await waitFor(() => expect(recognize).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => release({ text: '001', candidates: ['001'], diagnostics: { engine: 'test', elapsedMs: 0 } }))
    await waitFor(() => expect(h.trackStop).toHaveBeenCalledTimes(1))
    expect(h.getBox).not.toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
