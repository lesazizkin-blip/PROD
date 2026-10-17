import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/endpoints'
import { ApiError } from '../../api/client'
import ErrorAlert from '../../ui/ErrorAlert'
import { acquireCamera, cameraMessage } from './camera'
import { locateNumber } from './locateNumber'
import { normalizeCandidates, type LocalHandwriting } from './number'
import { lookupMessage } from './qr'
import { observeNumber, type StableNumber } from './stableNumber'
import { guideFrame } from './guideFrame'
import './liveNumber.css'

export default function LiveNumberCamera({ pid, recognize, onConfirm }: {
  pid: string; recognize: LocalHandwriting; onConfirm: (number: number) => Promise<void>
}) {
  const video = useRef<HTMLVideoElement>(null)
  const session = useRef<ReturnType<typeof acquireCamera> | null>(null)
  const mounted = useRef(false)
  const [visible, setVisible] = useState(!document.hidden)
  const [enabled, setEnabled] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Запрашиваем доступ к камере…')
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<{ n: number; room: string } | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    mounted.current = true
    const visibility = () => setVisible(!document.hidden)
    const hide = () => { setEnabled(false); setStatus('Камера остановлена. Нажмите «Продолжить».') }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', hide)
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', hide) }
  }, [])

  useEffect(() => {
    if (!enabled || !visible || found || !window.isSecureContext) return
    const controller = new AbortController()
    const element = video.current!
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let stable: StableNumber = { number: null, hits: 0 }
    const fail = (e: unknown) => {
      if (!controller.signal.aborted) { setError(cameraMessage(e)); setStatus('Камера недоступна'); setEnabled(false) }
    }
    const tick = async () => {
      if (controller.signal.aborted) return
      const started = performance.now()
      try {
        if (!element.videoWidth || !element.videoHeight) return
        setStatus('Ищем номер в рамке…')
        const regions = await locateNumber(await guideFrame(element), controller.signal)
        const numbers: number[] = []
        for (const region of regions) {
          if (controller.signal.aborted) return
          const result = await recognize(region, controller.signal)
          numbers.push(...normalizeCandidates(result.candidates))
        }
        if (controller.signal.aborted) return
        stable = observeNumber(stable, numbers)
        if (stable.number && stable.hits >= 2) {
          const n = stable.number
          setStatus('Проверяем коробку…')
          try {
            const box = await api.getBox(pid, n)
            if (!controller.signal.aborted) { setFound({ n, room: box.room }); setStatus('Коробка найдена. Проверьте номер.') }
          } catch (e) {
            if (controller.signal.aborted) return
            if (e instanceof ApiError && e.status === 404) { setStatus(`Коробка №${n} в этом проекте не найдена.`); stable = { number: null, hits: 0 } }
            else throw e
          }
        } else setStatus(stable.hits ? 'Вижу номер. Подержите камеру ещё немного…' : 'Наведите на один номер в рамке. Можно приблизить камеру.')
      } catch (e) {
        if (!controller.signal.aborted) { setError(lookupMessage(e)); setStatus('Распознавание остановлено'); setEnabled(false) }
      } finally {
        // One frame at a time; no overlapping OCR jobs or API calls.
        if (!controller.signal.aborted) timer = setTimeout(() => { void tick() }, Math.max(200, 1200 - (performance.now() - started)))
      }
    }
    const camera = acquireCamera(() => ({
      start: async () => {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } })
        element.srcObject = stream
        await element.play()
      },
      stop: async () => { stream?.getTracks().forEach(track => track.stop()); stream = undefined },
      clear: () => { element.srcObject = null },
      get isScanning() { return !!stream },
    }), () => { if (!controller.signal.aborted) void tick() }, fail)
    session.current = camera
    return () => { controller.abort(); clearTimeout(timer); void camera.stop().catch(() => {}) }
  }, [pid, recognize, attempt, enabled, visible, found])

  return <div className="live-number stack">
    <p>Наведите камеру на номер. Выделять цифры и делать снимок не нужно.</p>
    <div className="live-number-view" hidden={!!found}>
      <video ref={video} muted playsInline autoPlay />
      <span className="live-number-guide" aria-hidden="true" />
    </div>
    {found ? <div className="live-number-result stack">
      <strong>Коробка #{String(found.n).padStart(3, '0')} · {found.room}</strong>
      <button type="button" className="primary" disabled={opening} onClick={async () => {
        if (opening) return
        setOpening(true)
        try { await session.current?.stop(); await onConfirm(found.n) }
        catch (e) { if (mounted.current) setError(lookupMessage(e)) }
        finally { if (mounted.current) setOpening(false) }
      }}>Открыть коробку #{String(found.n).padStart(3, '0')}</button>
      <button type="button" disabled={opening} onClick={() => { setFound(null); setError(null); setEnabled(true); setAttempt(v => v + 1) }}>Сканировать другой номер</button>
    </div> : <button type="button" onClick={() => { setError(null); setStatus(enabled ? 'Камера приостановлена.' : 'Запрашиваем доступ к камере…'); setEnabled(v => !v); setAttempt(v => v + 1) }}>{enabled ? 'Приостановить' : 'Продолжить'}</button>}
    <p role="status" aria-live="polite">{!visible ? 'Камера приостановлена, пока вкладка скрыта.' : status}</p>
    <ErrorAlert message={error} />
    <p className="small">Экспериментальный режим. Кадры обрабатываются на устройстве и не сохраняются. Проверьте номер перед открытием.</p>
  </div>
}
