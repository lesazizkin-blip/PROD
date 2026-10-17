import { normalizeCandidates, type LocalHandwriting } from './number'
import { prepareNumber } from './prepareNumber'

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
export function createLocalOcrPrototype(createWorker: CreateOcrWorker, { keepWarm = false } = {}): LocalHandwriting {
  let initializationFailed = false
  type FailureOwner = { current?: () => void }
  let cached: { worker: OcrWorker; failures: FailureOwner } | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const release = () => {
    clearTimeout(idleTimer)
    const previous = cached; cached = undefined
    if (previous) { previous.failures.current = undefined; void previous.worker.terminate().catch(() => {}) }
  }
  const recognize: LocalHandwriting = async (photo, signal) => {
    if (initializationFailed) throw new Error('Локальная модель недоступна. Перезагрузите страницу после проверки её файлов.')
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const started = performance.now()
    clearTimeout(idleTimer)
    let worker: OcrWorker | undefined = cached?.worker
    const failures: FailureOwner = cached?.failures ?? {}
    cached = undefined
    let completed = false
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
    const terminate = () => { if (worker) { const current = worker; worker = undefined; failures.current = undefined; void current.terminate().catch(() => {}) } }
    failures.current = () => {
      aborted = true
      if (!worker) initializationFailed = true
      rejectAbort(new Error('Ошибка локального OCR. Проверьте локальные файлы модели и перезагрузите страницу.'))
    }
    const work = (async () => {
      worker ??= await createWorker('eng', 1, {
        workerPath: `${window.location.origin}/recognition/worker.min.js`,
        corePath: `${window.location.origin}/recognition/core`,
        langPath: `${window.location.origin}/recognition/lang`,
        workerBlobURL: false,
        cacheMethod: 'none',
        errorHandler: () => failures.current?.(),
      })
      if (aborted) { terminate(); throw new DOMException('Cancelled', 'AbortError') }
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' })
      if (aborted) throw new DOMException('Cancelled', 'AbortError')
      let { data } = await worker.recognize(photo)
      if (aborted) throw new DOMException('Cancelled', 'AbortError')
      if (!normalizeCandidates(data.text.split(/\r?\n/)).length) {
        try {
          const prepared = await prepareNumber(photo, signal)
          if (aborted) throw new DOMException('Cancelled', 'AbortError')
          await worker.setParameters({ tessedit_pageseg_mode: '7' })
          const retry = await worker.recognize(prepared)
          // Preserve invalid raw text if filtering did not produce a valid whole number.
          if (normalizeCandidates(retry.data.text.split(/\r?\n/)).length) data = retry.data
        } catch (error) {
          if (signal.aborted || aborted) throw error
          // Older browsers may lack OffscreenCanvas; original OCR is still available.
        }
      }
      completed = true
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
      if (keepWarm && completed && !aborted && worker) {
        release()
        failures.current = undefined
        cached = { worker, failures }; worker = undefined
        idleTimer = setTimeout(release, 15_000)
      } else terminate()
    }
  }
  recognize.release = release
  return recognize
}
