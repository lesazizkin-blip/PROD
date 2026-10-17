import { api } from '../api/endpoints'
import RequireProject from '../components/RequireProject'
import PrintWorkspace from '../features/labels/print/PrintWorkspace'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

export default function PrintAllPage() {
  return <RequireProject>{pid => <PrintAll key={pid} pid={pid} />}</RequireProject>
}
function PrintAll({ pid }: { pid: string }) {
  const labels = useAsync(() => api.labels(pid), [pid], { refreshOnFocus: true })
  return <StateView loading={labels.loading && !labels.data} error={labels.error} empty={labels.data?.length === 0} emptyText="Коробок пока нет" emptyIcon="🏷️" onRetry={labels.reload}>
    {labels.data?.length ? <PrintWorkspace labels={labels.data} pid={pid} preview /> : null}
  </StateView>
}
