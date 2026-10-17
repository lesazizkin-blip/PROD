import { createLocalOcrPrototype, type CreateOcrWorker } from './localOcr'
import type { LocalHandwriting } from './number'
let prototype: LocalHandwriting | undefined

/** Optional prototype entry point. Integrator must first vendor the local assets. */
export const recognizeWithLocalPrototype: LocalHandwriting = async (photo, signal) => {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (prototype) return prototype(photo, signal)
  const moduleUrl = `${window.location.origin}/recognition/tesseract.esm.min.js`
  let module: { default: { createWorker: CreateOcrWorker } }
  try { module = await import(/* @vite-ignore */ moduleUrl) }
  catch { throw new Error('Не удалось загрузить локальный OCR. Введите номер вручную или повторите позже.') }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
  if (typeof module.default?.createWorker !== 'function') throw new Error('Локальный OCR не установлен. Введите номер вручную.')
  prototype ??= createLocalOcrPrototype(module.default.createWorker)
  return prototype(photo, signal)
}
