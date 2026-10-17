import { expect, it, vi } from 'vitest'

it('при ошибке остановки блокирует нового владельца до перезагрузки', async () => {
  vi.resetModules()
  const { acquireCamera } = await import('./camera')
  const failed = vi.fn()
  const ready = vi.fn()
  const error = new Error('camera stop failed')
  const first = acquireCamera(() => ({ start: async () => {}, isScanning: true, stop: async () => { throw error }, clear: vi.fn() }), ready, failed)
  await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce())
  await expect(first.stop()).rejects.toBe(error)
  const create = vi.fn()
  const secondFailed = vi.fn()
  const second = acquireCamera(create, vi.fn(), secondFailed)
  await vi.waitFor(() => expect(secondFailed).toHaveBeenCalledWith(error))
  expect(create).not.toHaveBeenCalled()
  await second.stop()
})
