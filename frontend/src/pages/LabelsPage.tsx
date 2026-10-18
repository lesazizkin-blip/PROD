import { Link } from 'react-router-dom'
import { ScanLine } from 'lucide-react'
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
  return <div className="stack labels-page"><StateView loading={labels.loading && !labels.data} error={labels.error} empty={labels.data?.length === 0} emptyText="Сначала создайте коробку на вкладке «Коробки»" emptyIcon="🏷️" onRetry={labels.reload}>
    {labels.data?.length ? <PrintWorkspace labels={labels.data} pid={pid} extraSettings={<details className="qr-mode-details no-print"><summary>Настройки QR-кодов проекта</summary><QrModeSettings pid={pid} onSaved={labels.reload} /></details>} /> : null}
    {labels.data?.length ? <ScanCard /> : null}
  </StateView>
    <details className="mm-no-printer no-print"><summary>Нет принтера?</summary><p>Напишите маркером номер коробки и комнату с двух сторон. Например: #001 · Кухня. Найти содержимое можно по номеру в выбранном проекте.</p><Link to="/scan" className="button tonal">Найти коробку по номеру</Link></details>
  </div>
}

/** Этикетки наклеены - дальше их сканируют: камера открывает карточку коробки, там меняют статус. */
function ScanCard() {
  return <div className="scan-card no-print">
    <ScanLine className="icon" aria-hidden />
    <span className="grow">
      <b>Этикетки наклеены? Сканируйте QR</b>
      <span className="sub">Камера откроет карточку коробки: там видно содержимое и меняется статус. Без этикетки — по номеру.</span>
    </span>
    <Link to="/scan" className="button dark">Открыть сканер →</Link>
  </div>
}
