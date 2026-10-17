/** Process photo pixels in a local worker; do not block camera/UI with image loops. */
export function prepareNumber(photo: Blob, signal: AbortSignal): Promise<Blob> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./prepareNumber.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => { worker.terminate(); signal.removeEventListener('abort', cancel); clearTimeout(timer) }
    const cancel = () => { finish(); reject(new DOMException('Cancelled', 'AbortError')) }
    const timer = setTimeout(() => { finish(); reject(new Error('Обработка фото заняла слишком много времени.')) }, 5000)
    signal.addEventListener('abort', cancel, { once: true })
    worker.onmessage = (event: MessageEvent<{ photo?: Blob; error?: string }>) => {
      finish()
      if (event.data.photo) resolve(event.data.photo)
      else reject(new Error(event.data.error ?? 'Обработка фото недоступна.'))
    }
    worker.onerror = () => { finish(); reject(new Error('Обработка фото недоступна на этом устройстве.')) }
    worker.postMessage(photo)
  })
}
