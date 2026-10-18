import { QRCodeSVG } from 'qrcode.react'
import { useParams } from 'react-router-dom'
import RequireProject from '../components/RequireProject'
import { api } from '../api/endpoints'
import type { Label } from '../api/types'
import PrintWorkspace from '../features/labels/print/PrintWorkspace'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'
import { boxUrl } from '../ui/format'
import { roomStyle } from '../ui/roomTheme'

export default function LabelPage() {
  const { pid = '', n = '' } = useParams()
  return <RequireProject pid={pid}>{() => <ProjectLabel pid={pid} number={Number(n)} />}</RequireProject>
}

function ProjectLabel({ pid, number }: { pid: string; number: number }) {
  const label = useAsync(() => api.label(pid, number), [pid, number])
  return <StateView loading={label.loading && !label.data} error={label.error} onRetry={label.reload}>
    {label.data ? <>
      <ScreenLabel label={label.data} />
      <PrintWorkspace key={`${pid}-${number}`} labels={[label.data]} pid={pid} single />
    </> : null}
  </StateView>
}

/** Этикетка на экране телефона (без принтера): крупный номер, комната и QR, который читает любая камера. */
function ScreenLabel({ label }: { label: Label }) {
  const payload = import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false' ? label.qr_payload ?? undefined : undefined
  return <section className="card screen-label no-print" style={roomStyle(label.room)} aria-label={`Этикетка на экране: коробка ${label.number}`}>
    <div className="screen-label__number">{String(label.number).padStart(3, '0')}</div>
    <div className="screen-label__room">{label.room}</div>
    <QRCodeSVG className="screen-label__qr" value={payload ?? boxUrl(label.qr_path)} size={240} marginSize={4} level="M" bgColor="#ffffff" fgColor="#000000" />
    <p className="muted small">Покажите экран: QR откроет карточку коробки. Для наклейки — печать ниже.</p>
  </section>
}
