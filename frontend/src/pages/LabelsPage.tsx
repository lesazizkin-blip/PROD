import { api } from '../api/endpoints'
import RequireProject from '../components/RequireProject'
import PrintWorkspace from '../features/labels/print/PrintWorkspace'
import QrModeSettings from '../features/labels/QrModeSettings'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

export default function LabelsPage() {
  return <RequireProject>{pid => <LabelList key={pid} pid={pid} />}</RequireProject>
}
function LabelList({ pid }: { pid: string }) {
  const labels = useAsync(() => api.labels(pid), [pid], { refreshOnFocus: true })
  return <div className="stack"><QrModeSettings pid={pid} onSaved={labels.reload} /><StateView loading={labels.loading && !labels.data} error={labels.error} empty={labels.data?.length === 0} emptyText="Сначала создайте коробку на вкладке «Коробки»" emptyIcon="🏷️" onRetry={labels.reload}>
    {labels.data?.length ? <PrintWorkspace labels={labels.data} pid={pid} /> : null}
  </StateView></div>
}
