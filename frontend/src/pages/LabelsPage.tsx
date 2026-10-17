import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import LabelSheet from '../components/LabelSheet'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'
import { labelPath } from '../ui/format'

export default function LabelsPage() {
  return <RequireProject>{(pid) => <LabelList pid={pid} />}</RequireProject>
}

function LabelList({ pid }: { pid: string }) {
  const labels = useAsync(() => api.labels(pid), [pid])
  const list = labels.data ?? []
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(list.length / 12))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = list.slice(currentPage * 12, (currentPage + 1) * 12)
  return (
    <>
      <PageHeading title="Наклеить. Отсканировать. Найти.">Номер и комната видны сразу. Содержимое — по QR-коду.</PageHeading>
      <StateView loading={labels.loading && !labels.data} error={labels.error} empty={list.length === 0} emptyText="Сначала создайте коробку на вкладке «Коробки»" emptyIcon="🏷️" onRetry={labels.reload}>
        <div className="labels-layout">
          <aside className="card stack print-preparation no-print">
            <h2>Подготовка к печати</h2>
            <span className="eyebrow muted">01 / ВЫБЕРИТЕ КОРОБКУ</span>
            <p className="muted small">Нажмите на этикетку для просмотра и печати одной коробки.</p>
            <span className="eyebrow muted">02 / ПЕЧАТЬ</span>
            <p>Крупный номер, комната и QR-код, который открывает настоящую карточку.</p>
            <Link to="/labels/print" className="button primary">Печать всех ({list.length}) →</Link>
            <p className="muted small">В диалоге печати можно сохранить PDF.</p>
          </aside>
          <div className="label-preview">
            <span className="eyebrow muted">ПРЕДПРОСМОТР / ЭТИКЕТКИ</span>
            <div className="label-grid">{visible.map((label) => (
              <Link key={label.number} to={labelPath(pid, label.number)} className="label-preview-link" aria-label={`Этикетка коробки ${label.number}, ${label.room}`}>
                <LabelSheet label={label} size={112} />
              </Link>
            ))}</div>
            {pageCount > 1 ? <div className="row between no-print" aria-label="Страницы этикеток">
              <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Назад</button>
              <span className="small">{currentPage + 1} / {pageCount}</span>
              <button disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>Далее →</button>
            </div> : null}
          </div>
        </div>
      </StateView>
    </>
  )
}
