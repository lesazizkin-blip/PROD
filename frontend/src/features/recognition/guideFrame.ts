/** The percentages match the guide overlay. Only this region reaches local OCR. */
export async function guideFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth * .85, height = video.videoHeight * .45
  const ratio = Math.min(1, 1088 / width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Не удалось прочитать кадр камеры.')
  context.drawImage(video, video.videoWidth * .075, video.videoHeight * .275, width, height, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось прочитать кадр.')), 'image/png'))
}
