import { api } from '../api/endpoints'
import LabelSheet from '../components/LabelSheet'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

// Все этикетки одним листом: каждая на своей странице при печати.
export default function PrintAllPage() {
  return <RequireProject>{(pid) => <PrintAll pid={pid} />}</RequireProject>
}

function PrintAll({ pid }: { pid: string }) {
  const labels = useAsync(() => api.labels(pid), [pid])
  const list = labels.data ?? []
  return (
    <StateView loading={labels.loading && !labels.data} error={labels.error} empty={list.length === 0} emptyText="Коробок пока нет" emptyIcon="🏷️" onRetry={labels.reload}>
      <div className="row between no-print">
        <h2>Печать этикеток ({list.length})</h2>
        <button className="primary" onClick={() => window.print()}>Печать / PDF</button>
      </div>
      {list.map((l) => (
        <div key={l.number} className="card label-page"><LabelSheet label={l} size={200} /></div>
      ))}
    </StateView>
  )
}
