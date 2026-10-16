import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import { boxPath } from '../ui/format'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'

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
        <Link to="/labels/print"><button className="tonal">Печать всех</button></Link>
      </div>
      <div className="card flush">
        {list.map((b) => (
          <Link key={b.number} to={`${boxPath(pid, b.number)}/label`} className="list-row">
            <span aria-hidden>🏷️</span>
            <span className="grow"><b>№ {b.number} · {b.room}</b></span>
            <StatusBadge status={b.status} />
          </Link>
        ))}
      </div>
    </StateView>
  )
}
