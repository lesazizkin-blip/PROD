import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pause, Play, QrCode, RotateCcw } from 'lucide-react'
import { api } from '../api/endpoints'
import { ApiError } from '../api/client'
import { useProjects } from '../state/ProjectContext'
import ErrorAlert from '../ui/ErrorAlert'
import PageHeading from '../components/PageHeading'
import { boxPath } from '../ui/format'
import { acquireCamera, cameraMessage } from '../features/recognition/camera'
import { isCompactCode, lookupMessage, parseUniversalCode } from '../features/recognition/qr'
import { saveIntent, clearIntent, readIntent } from '../features/recognition/intent'
import { normalizeNumber, type ResolveCode } from '../features/recognition/number'
import '../features/recognition/scanner.css'

interface Services {
  /** Omit until the real backend resolver is verified. */
  resolveCode?: ResolveCode
}

export default function ScanPage(services: Services) {
  const { currentId, projects } = useProjects()
  const project = projects.find((p) => p.id === currentId)
  return <Scanner key={currentId ?? 'no-project'} pid={currentId} projectName={project?.name} {...services} />
}

function Scanner({ pid, projectName, resolveCode }: Services & { pid: string | null; projectName?: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [active, setActive] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [visible, setVisible] = useState(!document.hidden)
  const [status, setStatus] = useState('Ожидание камеры')
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'paused' | 'error'>('starting')
  const [busy, setBusy] = useState(false)
  const camera = useRef<ReturnType<typeof acquireCamera> | null>(null)
  const operation = useRef(0)
  const locked = useRef(false)

  useEffect(() => {
    const pause = () => {
      operation.current++
      locked.current = false
      setBusy(false)
      setActive(false)
      setCameraState('paused')
      void camera.current?.stop().catch(() => setError('Не удалось освободить камеру. Перезагрузите страницу.'))
      setStatus('Камера остановлена. Запустите снова после возвращения.')
    }
    const background = () => { setVisible(!document.hidden); if (document.hidden) pause() }
    document.addEventListener('visibilitychange', background)
    window.addEventListener('pagehide', pause)
    // These refs hold the latest operation, not a captured DOM node.
    return () => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      operation.current++
      document.removeEventListener('visibilitychange', background)
      window.removeEventListener('pagehide', pause)
    }
  }, [])


  const onScan = useEffectEvent((text: string) => {
    if (locked.current) return
    const universal = parseUniversalCode(text)
    const compact = isCompactCode(text)
    if (!universal && !compact) { setError('Это не QR-код коробки MoverMate. Попробуйте другой.'); return }
    if (compact && !resolveCode) { setError('Компактные QR пока недоступны на сервере. Используйте обычный QR или номер коробки.'); return }
    locked.current = true
    setStatus('Распознано')
    setError(null)
    setActive(false)
    setCameraState('paused')
    setBusy(true)
    const id = ++operation.current
    void (async () => {
      try {
        await camera.current?.stop()
        if (id !== operation.current) return
        setStatus('Открываем коробку…')
        const link = universal ?? await resolveCode!(text.trim()).then((r) => ({ pid: r.project_id, n: r.box_number }))
        if (!link) throw new Error('Некорректная ссылка на коробку.')
        if (id !== operation.current) return
        // Preserve the universal QR destination across a session-expiry login screen.
        try { await api.getBox(link.pid, link.n) }
        catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e
          saveIntent(text.trim())
        }
        if (id === operation.current) { clearIntent(); navigate(boxPath(link.pid, link.n)) }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) saveIntent(text.trim())
        else if (id === operation.current) clearIntent()
        if (id === operation.current) { setError(lookupMessage(e)); setStatus('Не удалось открыть коробку') }
      } finally {
        if (id === operation.current) { setBusy(false); locked.current = false }
      }
    })()
  })

  useEffect(() => {
    let cancelled = false
    // StrictMode cancels the first setup before replaying it.
    void Promise.resolve().then(() => { const code = readIntent(); if (!cancelled && code) onScan(code) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!active || !visible) return
    if (!window.isSecureContext) return
    let live = true
    const cameraOperation = operation.current
    const session = acquireCamera(() => {
      setCameraState('starting')
      setStatus('Запрашиваем доступ к камере…')
      const scanner = new Html5Qrcode('qr-reader')
      return {
        start: () => scanner.start({ facingMode: 'environment' }, {
          fps: 10,
          qrbox: (width, height) => { const side = Math.max(50, Math.floor(Math.min(width, height) * 0.75)); return { width: side, height: side } },
        }, (text) => { if (live && cameraOperation === operation.current && !document.hidden) onScan(text) }, undefined).then(() => {}),
        stop: () => scanner.stop(), clear: () => scanner.clear(),
        // The legacy boolean can lag behind rapid start/stop cycles. The state
        // manager is also what Html5Qrcode.stop()/clear() use internally.
        get isScanning() { return scanner.getState() !== Html5QrcodeScannerState.NOT_STARTED },
      }
    }, () => { if (live) { setCameraState('ready'); setStatus('Готово. Наведите камеру на QR.') } }, (e) => {
      if (live) { setCameraState('error'); setError(cameraMessage(e)); setStatus('Ошибка камеры') }
    })
    camera.current = session
    return () => { live = false; void session.stop().catch(() => {}) }
  }, [active, visible, attempt])

  function restart() {
    operation.current++
    locked.current = false
    setBusy(false)
    setError(null)
    setCameraState('starting')
    setStatus('Запрашиваем доступ к камере…')
    setActive(true)
    setAttempt((v) => v + 1)
  }

  async function pauseQr() {
    operation.current++
    setActive(false)
    setCameraState('paused')
    setStatus('Камера приостановлена.')
    try { await camera.current?.stop() }
    catch (e) { setCameraState('error'); setError(cameraMessage(e)) }
  }

  async function openNumber(e?: FormEvent, supplied?: number) {
    e?.preventDefault()
    const n = supplied ?? normalizeNumber(number)
    if (!pid || n === null) { setError('Введите положительный номер целиком, например #001.'); return }
    if (locked.current) return
    locked.current = true
    const id = ++operation.current
    setBusy(true); setActive(false); setError(null); setStatus('Проверяем коробку…')
    try {
      await camera.current?.stop()
      if (id !== operation.current) return
      await api.getBox(pid, n)
      if (id === operation.current) { clearIntent(); navigate(boxPath(pid, n)) }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) saveIntent(boxPath(pid, n))
      else if (id === operation.current) clearIntent()
      if (id === operation.current) { setError(lookupMessage(e)); setStatus('Не удалось открыть коробку') }
    }
    finally { if (id === operation.current) { setBusy(false); locked.current = false } }
  }

  return <div className="recognition-page">
    <PageHeading title="Сканирование QR">Наведите камеру на этикетку или найдите коробку по номеру.</PageHeading>
    <p className="scan-project muted small">Номер ищем в проекте <strong>{projectName ?? 'не выбран'}</strong>. <Link to="/projects">Выбрать другой</Link></p>
    <div className="scan-layout">
      <div className="scan-stage stack">
        <div className="scan-viewfinder">
        <div id="qr-reader" className="scanner" />
        {cameraState !== 'ready' || !active ? <div className="scan-placeholder"><QrCode aria-hidden /><span>{cameraState === 'error' ? 'Камера недоступна' : cameraState === 'starting' && active ? 'Включаем камеру…' : 'Камера на паузе'}</span><small>QR-этикетка должна целиком попасть в рамку</small></div> : null}
        </div>
        <button type="button" className="qr-camera-control" disabled={busy || !visible || (active && cameraState === 'starting')} onClick={() => { if (active && cameraState === 'ready') void pauseQr(); else restart() }}>
          {cameraState === 'error' ? <RotateCcw className="icon-sm" aria-hidden="true" /> : active && cameraState === 'ready' ? <Pause className="icon-sm" aria-hidden="true" /> : <Play className="icon-sm" aria-hidden="true" />}
          {cameraState === 'error' ? 'Повторить запуск камеры' : active && cameraState === 'starting' ? 'Запускаем камеру…' : active && cameraState === 'ready' ? 'Приостановить камеру' : 'Продолжить сканирование'}
        </button>
        <p role="status" aria-live="polite">{status}</p>
        <ErrorAlert message={error ?? (!window.isSecureContext ? 'Камера работает только по HTTPS (или на localhost). Введите номер коробки вручную.' : null)} />
      </div>
      {pid ? <form className="card stack scan-number" onSubmit={(e) => { void openNumber(e) }}>
        <h2>Знаете номер?</h2><p className="muted small">Введите его без сканирования. Найдём коробку в выбранном проекте.</p>
        <label>Или введите номер коробки<input type="text" inputMode="numeric" autoComplete="off" placeholder="#001" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <button className="primary" type="submit" disabled={!number || busy}>Подтвердить и открыть</button>
      </form> : <p className="muted">Ручной ввод номера доступен после выбора проекта.</p>}
    </div>
  </div>
}
