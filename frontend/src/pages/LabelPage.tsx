import { useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import PrintWorkspace from '../features/labels/print/PrintWorkspace'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

export default function LabelPage() {
  const { pid = '', n = '' } = useParams()
  const number = Number(n)
  const label = useAsync(() => api.label(pid, number), [pid, number])
  return <StateView loading={label.loading && !label.data} error={label.error} onRetry={label.reload}>
    {label.data ? <PrintWorkspace key={`${pid}-${number}`} labels={[label.data]} pid={pid} single /> : null}
  </StateView>
}
