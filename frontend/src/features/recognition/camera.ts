/** Serialize ownership even across StrictMode remounts of the reader element. */
let releasePrevious: Promise<void> = Promise.resolve()
let blockedError: unknown

export interface CameraSession {
  start: () => Promise<void>
  stop: () => Promise<void>
  clear: () => void
  isScanning: boolean
}

export function acquireCamera(
  create: () => CameraSession,
  ready: () => void,
  failed: (error: unknown) => void,
) {
  let cancelled = false
  const previous = releasePrevious
  let release!: () => void
  releasePrevious = new Promise<void>((resolve) => { release = resolve })
  let session: CameraSession | undefined
  let starting: Promise<void>
  let stopping: Promise<void> | undefined
  function stop(): Promise<void> {
    cancelled = true
    if (stopping) return stopping
    stopping = starting.then(async () => {
      try {
        if (session?.isScanning) await session.stop()
        session?.clear()
      } catch (error) {
        // Fail closed until reload instead of starting a second camera stream.
        blockedError = error
        failed(error)
        throw error
      } finally { release() }
    })
    return stopping
  }
  starting = previous.then(async () => {
    if (cancelled) return
    try {
      if (blockedError) throw blockedError
      session = create()
      await session.start()
      if (!cancelled) ready()
    } catch (error) {
      if (!cancelled) failed(error)
    }
  })
  return { stop }
}

export function cameraMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : String(error)
  if (/NotAllowed|PermissionDenied/.test(name)) return 'Доступ к камере запрещён. Разрешите его в настройках браузера и повторите запуск.'
  if (/NotFound|DevicesNotFound/.test(name)) return 'Камера не найдена. Подключите её или введите номер вручную.'
  if (/NotReadable|TrackStart/.test(name)) return 'Камера занята или недоступна. Закройте другое приложение и повторите запуск.'
  return 'Не удалось запустить или освободить камеру. Повторите запуск; если ошибка остаётся, перезагрузите страницу.'
}
