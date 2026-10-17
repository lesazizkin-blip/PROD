import { cleanNumberPixels } from './cleanNumberPixels'

self.onmessage = async (event: MessageEvent<Blob>) => {
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(event.data)
    const ratio = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * ratio))
    const height = Math.max(1, Math.round(bitmap.height * ratio))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas недоступен')
    context.drawImage(bitmap, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height)
    pixels.data.set(cleanNumberPixels(pixels.data, width, height))
    context.putImageData(pixels, 0, 0)
    const scale = Math.min(3, 1600 / Math.max(width, height))
    const output = new OffscreenCanvas(Math.round(width * scale) + 40, Math.round(height * scale) + 40)
    const target = output.getContext('2d')
    if (!target) throw new Error('Canvas недоступен')
    target.fillStyle = '#fff'; target.fillRect(0, 0, output.width, output.height)
    target.imageSmoothingEnabled = false
    target.drawImage(canvas, 20, 20, output.width - 40, output.height - 40)
    self.postMessage({ photo: await output.convertToBlob({ type: 'image/png' }) })
  } catch {
    self.postMessage({ error: 'Не удалось улучшить контраст снимка.' })
  } finally { bitmap?.close() }
}
