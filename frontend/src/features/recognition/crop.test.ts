import { afterEach, expect, it, vi } from 'vitest'
import { cropPhoto } from './crop'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('обрезает заданную область, уменьшает до 1600 и закрывает bitmap', async () => {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }))
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback) { callback(new Blob(['crop'], { type: 'image/png' })) })
  await cropPhoto(new Blob(), { x: 25, y: 0, width: 50, height: 50 })
  expect(drawImage.mock.calls[0].slice(1)).toEqual([1000, 0, 2000, 1000, 0, 0, 1600, 800])
  expect(close).toHaveBeenCalledOnce()
})
it('отклоняет чрезмерное изображение и освобождает bitmap', async () => {
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10000, height: 10000, close }))
  await expect(cropPhoto(new Blob(), { x: 0, y: 0, width: 100, height: 100 })).rejects.toThrow(/40 мегапикселей/)
  expect(close).toHaveBeenCalledOnce()
})
