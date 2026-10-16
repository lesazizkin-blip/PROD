import { Link, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import LabelSheet from '../components/LabelSheet'
import { useAsync } from '../state/useAsync'
import { boxPath } from '../ui/format'
import StateView from '../ui/StateView'

// Этикетка одной коробки: «Печать / PDF» открывает системный диалог (печать или «Сохранить как PDF»).
export default function LabelPage() {
  const { pid = '', n = '' } = useParams()
  const number = Number(n)
  const label = useAsync(() => api.label(pid, number), [pid, number])
  return (
    <StateView loading={label.loading && !label.data} error={label.error} onRetry={label.reload}>
      {label.data ? (
        <>
          <div className="card"><LabelSheet label={label.data} /></div>
          <div className="row wrap no-print">
            <button className="primary" onClick={() => window.print()}>Печать / PDF</button>
            <Link to={boxPath(pid, number)}><button>К коробке</button></Link>
          </div>
        </>
      ) : null}
    </StateView>
  )
}
