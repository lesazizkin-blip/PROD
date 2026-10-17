import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Pause, Play, QrCode, RotateCcw, ScanLine } from 'lucide-react'
import { api } from '../api/endpoints'
import { ApiError } from '../api/client'
import { useProjects } from '../state/ProjectContext'
import ErrorAlert from '../ui/ErrorAlert'
import PageHeading from '../components/PageHeading'
import { boxPath } from '../ui/format'
import { acquireCamera, cameraMessage } from '../features/recognition/camera'
import { isCompactCode, lookupMessage, parseUniversalCode } from '../features/recognition/qr'
import { saveIntent, clearIntent, readIntent } from '../features/recognition/intent'
import PhotoCrop from '../features/recognition/PhotoCrop'
import LiveNumberCamera from '../features/recognition/LiveNumberCamera'
import { cropPhoto, FULL_CROP } from '../features/recognition/crop'
import { normalizeCandidates, normalizeNumber, type HandwritingResult, type LocalHandwriting, type ResolveCode } from '../features/recognition/number'
import '../features/recognition/scanner.css'

interface Services {
  /** Omit until the real backend resolver is verified. */
  resolveCode?: ResolveCode
  /** Experimental local worker, with locally hosted assets. */
  recognizeHandwriting?: LocalHandwriting
}

export default function ScanPage(services: Services) {
  const { currentId, projects } = useProjects()
  const project = projects.find((p) => p.id === currentId)
  return <Scanner key={currentId ?? 'no-project'} pid={currentId} projectName={project?.name} {...services} />
}

function Scanner({ pid, projectName, resolveCode, recognizeHandwriting }: Services & { pid: string | null; projectName?: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [number, setNumber] = useState('')
  const [mode, setMode] = useState<'qr' | 'photo' | 'live'>('qr')
  const [active, setActive] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [visible, setVisible] = useState(!document.hidden)
  const [status, setStatus] = useState('Ожидание камеры')
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'paused' | 'error'>('starting')
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [crop, setCrop] = useState(FULL_CROP)
  const [result, setResult] = useState<HandwritingResult | null>(null)
  const [candidates, setCandidates] = useState<{ n: number; room: string }[]>([])
  const camera = useRef<ReturnType<typeof acquireCamera> | null>(null)
  const operation = useRef(0)
  const locked = useRef(false)
  const ocrAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const pause = () => {
      operation.current++
      ocrAbort.current?.abort()
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
      ocrAbort.current?.abort()
      document.removeEventListener('visibilitychange', background)
      window.removeEventListener('pagehide', pause)
    }
  }, [])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

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
    if (mode !== 'qr' || !active || !visible) return
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
        get isScanning() { return scanner.isScanning },
      }
    }, () => { if (live) { setCameraState('ready'); setStatus('Готово. Наведите камеру на QR.') } }, (e) => {
      if (live) { setCameraState('error'); setError(cameraMessage(e)); setStatus('Ошибка камеры') }
    })
    camera.current = session
    return () => { live = false; void session.stop().catch(() => {}) }
  }, [mode, active, visible, attempt])

  function restart() {
    operation.current++
    ocrAbort.current?.abort()
    locked.current = false
    setBusy(false)
    setError(null)
    setPhoto(null); setPreview(null); setCandidates([]); setResult(null)
    setMode('qr')
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

  async function selectPhoto(file: File | undefined) {
    if (!file || !pid) return
    ocrAbort.current?.abort()
    operation.current++
    setCrop(FULL_CROP)
    setResult(null); setCandidates([]); setPhoto(null); setPreview(null); setError(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setError('Выберите JPEG, PNG или WebP размером до 12 МБ.'); return
    }
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    if (!recognizeHandwriting) { setStatus('Фото остаётся на устройстве. Локальный OCR ещё не подключён.'); return }
    setStatus('Выделите надпись и нажмите «Распознать фото».')
  }

  async function recognizePhoto() {
    if (!photo || !pid || !recognizeHandwriting) return
    const id = ++operation.current
    const controller = new AbortController()
    ocrAbort.current = controller
    setResult(null); setCandidates([]); setError(null)
    setBusy(true); setStatus('Распознаём номер на устройстве…')
    try {
      const cropped = await cropPhoto(photo, crop)
      if (id !== operation.current) return
      const recognized = await recognizeHandwriting(cropped, controller.signal)
      if (id !== operation.current) return
      setResult(recognized)
      const values = normalizeCandidates(recognized.candidates)
      if (values.length > 3) { setStatus('Нужен новый снимок'); setError('Слишком много возможных номеров. Снимите только надпись или введите номер.'); return }
      const found = await Promise.all(values.map(async (n) => {
        try { const box = await api.getBox(pid, n); return { n, room: box.room } }
        catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
      }))
      if (id !== operation.current) return
      const existing = found.filter((v): v is { n: number; room: string } => v !== null)
      setCandidates(existing)
      setStatus(existing.length ? 'Выберите номер и подтвердите открытие.' : 'Номер не найден. Выделите только цифры без #, переснимите или введите номер.')
    } catch (e) { if (id === operation.current && !controller.signal.aborted) { setError(lookupMessage(e)); setStatus('Ошибка распознавания') } }
    finally { if (id === operation.current) setBusy(false) }
  }

  return <div className="recognition-page">
    <PageHeading title={mode === 'live' ? 'Распознать номер' : mode === 'photo' ? 'Номер с фотографии' : 'Сканирование QR'}>{mode === 'live' ? 'Наведите камеру на рукописный номер коробки.' : mode === 'photo' ? 'Снимите номер коробки крупным планом или введите его вручную.' : 'Наведите камеру на этикетку или найдите коробку по номеру.'}</PageHeading>
    <p>Проект для номера и фото: <strong>{projectName ?? 'не выбран'}</strong></p>
    <div className="recognition-modes" role="group" aria-label="Способ сканирования">
      <button type="button" aria-pressed={mode === 'qr'} onClick={restart} disabled={busy || mode === 'qr'}><QrCode aria-hidden="true" className="icon-sm" />QR-код</button>
      <button type="button" aria-pressed={mode === 'live'} disabled={!pid || busy || !recognizeHandwriting || mode === 'live'} onClick={async () => {
        setActive(false)
        const id = ++operation.current
        ocrAbort.current?.abort()
        try {
          await camera.current?.stop()
          if (id !== operation.current) return
          setMode('live'); setError(null); setStatus('Наведите на номер в рамке.')
        } catch (e) { if (id === operation.current) setError(cameraMessage(e)) }
      }}><ScanLine aria-hidden="true" className="icon-sm" />Камера номера</button>
      <button type="button" aria-pressed={mode === 'photo'} disabled={!pid || busy || mode === 'photo'} onClick={async () => {
        setActive(false)
        setStatus('Останавливаем QR-камеру…')
        const id = ++operation.current
        try {
          await camera.current?.stop()
          if (id !== operation.current) return
          setMode('photo'); setStatus('Снимите крупно только номер на коробке.'); setError(null)
        } catch (e) { if (id === operation.current) setError(cameraMessage(e)) }
      }}><Camera aria-hidden="true" className="icon-sm" />Фото номера</button>
    </div>
    <div className="scan-layout">
      <div className="scan-stage stack">
        <div id="qr-reader" className="scanner" hidden={mode !== 'qr'} />
        {mode === 'qr' ? <button type="button" className="qr-camera-control" disabled={busy || !visible || (active && cameraState === 'starting')} onClick={() => { if (active && cameraState === 'ready') void pauseQr(); else restart() }}>
          {cameraState === 'error' ? <RotateCcw className="icon-sm" aria-hidden="true" /> : active && cameraState === 'ready' ? <Pause className="icon-sm" aria-hidden="true" /> : <Play className="icon-sm" aria-hidden="true" />}
          {cameraState === 'error' ? 'Повторить запуск камеры' : active && cameraState === 'starting' ? 'Запускаем камеру…' : active && cameraState === 'ready' ? 'Приостановить камеру' : 'Продолжить сканирование'}
        </button> : null}
        {mode === 'live' && pid && recognizeHandwriting ? <LiveNumberCamera pid={pid} recognize={recognizeHandwriting} onConfirm={n => openNumber(undefined, n)} /> : null}
        {mode === 'photo' ? <div className="stack">
          <p>Экспериментальное распознавание. Качество на реальном почерке пока не проверено. Фото не отправляется на сервер.</p>
          <p>Поместите только надпись в кадр, без адресов и других чисел.</p>
          <label>Снять или выбрать фото<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(e) => { void selectPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
          {preview ? <PhotoCrop src={preview} value={crop} onChange={value => { setCrop(value); setResult(null); setCandidates([]); setError(null); setStatus('Область изменена. Распознайте фото заново.') }} disabled={busy} /> : null}
          {photo && recognizeHandwriting ? <button type="button" disabled={busy} onClick={() => { void recognizePhoto() }}>Распознать фото</button> : null}
          {photo ? <button type="button" onClick={() => { operation.current++; ocrAbort.current?.abort(); setBusy(false); setPhoto(null); setPreview(null); setResult(null); setCandidates([]); setStatus('Снимите номер ещё раз.') }}>Удалить фото / переснять</button> : null}
          {result ? <p>Распознано: <output>{result.text || '(пусто)'}</output></p> : null}
          {candidates.map((c) => <button type="button" key={c.n} disabled={busy} onClick={() => setNumber(String(c.n))}>Выбрать #{String(c.n).padStart(3, '0')} · {c.room}</button>)}
        </div> : null}
        {mode !== 'live' ? <p role="status" aria-live="polite">{status}</p> : null}
        <ErrorAlert message={error ?? (!window.isSecureContext ? 'Камера работает только по HTTPS (или на localhost). Введите номер коробки вручную.' : null)} />
      </div>
      {pid ? <form className="card stack scan-number" onSubmit={(e) => { void openNumber(e) }}>
        <h2>Поиск по номеру</h2><p>Подтверждение в проекте «{projectName}»</p>
        <label>Или введите номер коробки<input type="text" inputMode="text" autoComplete="off" placeholder="#001" value={number} onChange={(e) => setNumber(e.target.value)} /></label>
        <button className="primary" type="submit" disabled={!number || busy}>Подтвердить и открыть</button>
      </form> : <p className="muted">Номер вручную и фото доступны после выбора проекта.</p>}
    </div>
  </div>
}
