import { Link, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import LabelSheet from '../components/LabelSheet'
import PageHeading from '../components/PageHeading'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'
import { boxPath } from '../ui/format'

// Этикетка одной коробки: «Печать / PDF» открывает системный диалог (печать или «Сохранить как PDF»).
export default function LabelPage() {
  const { pid = '', n = '' } = useParams()
  const number = Number(n)
  const label = useAsync(() => api.label(pid, number), [pid, number])
  return (
    <StateView loading={label.loading && !label.data} error={label.error} onRetry={label.reload}>
      {label.data ? (
        <>
          <PageHeading title={`Этикетка · коробка ${String(number).padStart(3, '0')}`}>{label.data.room} · Приклейте на две стороны коробки</PageHeading>
          <div className="single-label-layout">
          <div className="single-label-preview"><LabelSheet label={label.data} /></div>
          <div className="card stack no-print label-actions">
            <h2>Параметры этикетки</h2>
            <p>Номер: {String(number).padStart(3, '0')} · Комната: {label.data.room}</p>
            <p className="muted small">QR-код открывает карточку этой коробки.</p>
            <button className="primary" onClick={() => window.print()}>Печать / PDF</button>
            <Link to={boxPath(pid, number)} className="button">К коробке</Link>
          </div>
          </div>
        </>
      ) : null}
    </StateView>
  )
}
