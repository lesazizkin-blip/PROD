import { Link } from 'react-router-dom'
import { Printer, QrCode } from 'lucide-react'
import { api } from '../api/endpoints'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { labelPath } from '../ui/format'

export default function LabelsPage() {
  return <RequireProject>{(pid) => <LabelList pid={pid} />}</RequireProject>
}

function LabelList({ pid }: { pid: string }) {
  const boxes = useAsync(() => api.boxes(pid, { page_size: 200 }), [pid])
  const list = boxes.data?.items ?? []
  return (
    <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={list.length === 0} emptyText="Сначала создайте коробку на вкладке «Коробки»" emptyIcon="🏷️" onRetry={boxes.reload}>
      <div className="row between">
        <h2>Этикетки</h2>
        <Link to="/labels/print" className="button tonal"><Printer className="icon-sm" aria-hidden />Печать всех</Link>
      </div>
      <p className="muted small">Нажмите на этикетку, чтобы открыть её крупно, напечатать или показать с телефона.</p>
      <div className="sticker-grid">
        {list.map((b) => (
          <Link key={b.number} to={labelPath(pid, b.number)} className="sticker" aria-label={`Этикетка коробки № ${b.number}, ${b.room}`}>
            <span className="sticker__no">{b.number}</span>
            <span className="sticker__room">{b.room}</span>
            <QrCode className="sticker__qr" aria-hidden />
            <StatusBadge status={b.status} />
          </Link>
        ))}
      </div>
    </StateView>
  )
}
