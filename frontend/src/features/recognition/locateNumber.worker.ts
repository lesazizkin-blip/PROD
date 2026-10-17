import { cleanNumberPixels } from './cleanNumberPixels'
import { findNumberRegions } from './findNumberRegions'

self.onmessage = async (event: MessageEvent<Blob>) => {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(event.data)
    const ratio = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * ratio)), h = Math.max(1, Math.round(bitmap.height * ratio))
    const canvas = new OffscreenCanvas(w, h), context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas недоступен')
    context.drawImage(bitmap, 0, 0, w, h)
    const image = context.getImageData(0, 0, w, h)
    image.data.set(cleanNumberPixels(image.data, w, h)); context.putImageData(image, 0, 0)
    const regions = findNumberRegions(image.data, w, h), photos: Blob[] = []
    for (const region of regions) {
      const scale = Math.min(4, 1200 / Math.max(region.width, region.height))
      const output = new OffscreenCanvas(Math.round(region.width * scale) + 40, Math.round(region.height * scale) + 40)
      const ctx = output.getContext('2d')
      if (!ctx) continue
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(canvas, region.x, region.y, region.width, region.height, 20, 20, output.width - 40, output.height - 40)
      photos.push(await output.convertToBlob({ type: 'image/png' }))
    }
    self.postMessage({ photos })
  } catch { self.postMessage({ error: 'Не удалось найти номер в кадре. Попробуйте фото или ручной ввод.' }) }
  finally { bitmap?.close() }
}
