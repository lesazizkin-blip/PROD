import { useId, useState } from 'react'
import { Camera } from 'lucide-react'
import { errorMessage } from '../api/client'
import ErrorAlert from '../ui/ErrorAlert'
import { photoToDataUrl } from '../ui/photo'

/** Кнопка «по фото» с явным согласием: фото уходит внешней модели (LLM-прокси Spirit) только после галочки,
 *  в уменьшенном виде и без сохранения. onPhoto получает data URL и возвращает промис запроса к серверу. */
export default function PhotoPicker({ label, busyLabel, onPhoto }: { label: string; busyLabel: string; onPhoto: (image: string) => Promise<void> }) {
  const id = useId()
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await onPhoto(await photoToDataUrl(file))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="photo-picker stack">
      <label className="photo-picker__consent">
        <input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
        <span>Разрешаю отправить это фото внешнему AI-сервису для распознавания. Фото не сохраняется; не снимайте документы и людей.</span>
      </label>
      <label htmlFor={id} className={`button photo-picker__button${!consent || busy ? ' disabled' : ''}`} aria-disabled={!consent || busy}>
        <Camera className="icon-sm" aria-hidden />{busy ? busyLabel : label}
      </label>
      <input id={id} type="file" accept="image/*" capture="environment" hidden disabled={!consent || busy}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
      {busy ? <span className="muted small" role="status">Распознавание занимает до минуты.</span> : null}
      <ErrorAlert message={error} />
    </div>
  )
}
