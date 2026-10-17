export interface Crop { x: number; y: number; width: number; height: number }
export const FULL_CROP: Crop = { x: 0, y: 0, width: 100, height: 100 }

/** Crop and downscale locally before passing pixels to the OCR worker. */
export async function cropPhoto(photo: Blob, crop: Crop): Promise<Blob> {
  const bitmap = await createImageBitmap(photo)
  try {
    if (bitmap.width * bitmap.height > 40_000_000) throw new Error('Фото слишком большое. Выберите снимок до 40 мегапикселей.')
    const sx = Math.round(bitmap.width * crop.x / 100)
    const sy = Math.round(bitmap.height * crop.y / 100)
    const sw = Math.max(1, Math.round(bitmap.width * crop.width / 100))
    const sh = Math.max(1, Math.round(bitmap.height * crop.height / 100))
    const scale = Math.min(1, 1600 / Math.max(sw, sh))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Не удалось подготовить фото на устройстве.')
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Не удалось подготовить фото.')), 'image/png'))
  } finally { bitmap.close() }
}
