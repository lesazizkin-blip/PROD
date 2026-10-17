import type { LocalHandwriting } from './number'

interface OcrWorker {
  setParameters: (parameters: Record<string, string>) => Promise<unknown>
  recognize: (photo: Blob) => Promise<{ data: { text: string } }>
  terminate: () => Promise<unknown>
}
export type CreateOcrWorker = (language: string, engine: number, options: {
  workerPath: string; corePath: string; langPath: string; workerBlobURL: boolean; cacheMethod: string
  errorHandler: (error: unknown) => void
}) => Promise<OcrWorker>

/**
 * Experimental Tesseract.js baseline, NOT validated handwriting recognition.
 * Integrator injects createWorker and hosts ALL assets locally; no CDN defaults.
 * Do not whitelist digits: removing letters can turn an address into a box number.
 */
export function createLocalOcrPrototype(createWorker: CreateOcrWorker): LocalHandwriting {
  let initializationFailed = false
  return async (photo, signal) => {
    if (initializationFailed) throw new Error('Локальная модель недоступна. Перезагрузите страницу после проверки её файлов.')
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const started = performance.now()
    let worker: OcrWorker | undefined
    let aborted = false
    let rejectAbort!: (error: Error) => void
    const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject })
    const abort = () => {
      aborted = true
      rejectAbort(new DOMException('Распознавание отменено', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => {
      aborted = true
      if (!worker) initializationFailed = true
      rejectAbort(new Error('Локальный OCR не ответил за 45 секунд. Переснимите или введите номер.'))
    }, 45_000)
    const terminate = () => { if (worker) { const current = worker; worker = undefined; void current.terminate().catch(() => {}) } }
    const work = (async () => {
      worker = await createWorker('eng', 1, {
        workerPath: `${window.location.origin}/recognition/worker.min.js`,
        corePath: `${window.location.origin}/recognition/core`,
        langPath: `${window.location.origin}/recognition/lang`,
        workerBlobURL: false,
        cacheMethod: 'none',
        errorHandler: () => {
          aborted = true
          if (!worker) initializationFailed = true
          rejectAbort(new Error('Ошибка локального OCR. Проверьте локальные файлы модели и перезагрузите страницу.'))
        },
      })
      if (aborted) { terminate(); throw new DOMException('Cancelled', 'AbortError') }
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
      if (aborted) throw new DOMException('Cancelled', 'AbortError')
      const { data } = await worker.recognize(photo)
      return {
        text: data.text,
        candidates: data.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
        diagnostics: { engine: 'Tesseract.js local prototype (unvalidated handwriting)', elapsedMs: performance.now() - started },
      }
    })()
    try { return await Promise.race([work, cancelled]) }
    finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      terminate()
    }
  }
}
