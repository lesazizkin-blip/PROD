import { useState } from 'react'
import { BOX_STATUSES, type BoxStatus } from '../api/types'
import { STATUS_LABELS } from '../ui/format'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import Modal from './Modal'

export default function CorrectBoxStatusModal({ current, number, onSave, onClose }: { current: BoxStatus; number: number; onSave: (status: BoxStatus, reason: string) => Promise<void>; onClose: () => void }) {
  const earlier = BOX_STATUSES.slice(0, BOX_STATUSES.indexOf(current))
  const [status, setStatus] = useState(earlier.at(-1) ?? current)
  const [reason, setReason] = useState('')
  const { busy, error, submit } = useAction()
  return <Modal title={`Исправить статус коробки № ${number}`} onClose={onClose}>
    <form className="stack" onSubmit={submit(async () => { await onSave(status, reason.trim()); onClose() })}>
      <p>Верните ошибочно отмеченную коробку на более ранний этап. Причина сохранится в журнале проекта.</p>
      <p className="muted small">Сейчас: {STATUS_LABELS[current]}</p>
      <label>Правильный статус<select value={status} disabled={busy} onChange={e => setStatus(e.target.value as BoxStatus)}>{earlier.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}</select></label>
      <label>Причина исправления<textarea value={reason} minLength={5} maxLength={300} onChange={e => setReason(e.target.value)} required disabled={busy} /></label>
      <ErrorAlert message={error} />
      <button className="primary" disabled={busy || reason.trim().length < 5 || !earlier.length}>Исправить на «{STATUS_LABELS[status]}»</button>
    </form>
  </Modal>
}
