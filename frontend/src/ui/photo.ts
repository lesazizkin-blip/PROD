/** Уменьшает фото в браузере перед отправкой модели: длинная сторона до 1280 px, JPEG.
 *  Так запрос быстрее и дешевле, а исходный файл (с метаданными EXIF, в том числе геопозицией) не уходит. */
export async function photoToDataUrl(file: File, maxSide = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Выберите фото')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Браузер не смог обработать фото')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82)
}
