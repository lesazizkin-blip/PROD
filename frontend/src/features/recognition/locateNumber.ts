/** Localize glyphs in the camera guide without transferring frames off the device. */
export function locateNumber(frame: Blob, signal: AbortSignal): Promise<Blob[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./locateNumber.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.terminate(); clearTimeout(timer); signal.removeEventListener('abort', cancel) }
    const cancel = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { finish(); reject(new Error('Поиск номера занял слишком много времени.')) }, 5000)
    signal.addEventListener('abort', cancel, { once: true })
    worker.onmessage = (event: MessageEvent<{ photos?: Blob[]; error?: string }>) => {
      finish()
      if (event.data.photos) resolve(event.data.photos); else reject(new Error(event.data.error))
    }
    worker.onerror = () => { finish(); reject(new Error('Автоматический поиск номера недоступен на этом устройстве. Используйте фото или ручной ввод.')) }
    worker.postMessage(frame)
  })
}
