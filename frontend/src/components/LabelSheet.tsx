import { QRCodeSVG } from 'qrcode.react'
import type { Label } from '../api/types'
import { boxUrl } from '../ui/format'

/** Этикетка: крупный номер, комната и QR-код. QR строится в браузере, внешних сервисов нет. */
export default function LabelSheet({ label, size = 240 }: { label: Label; size?: number }) {
  return (
    <div className="label-sheet">
      <span className="label-brand">MOVERMATE</span>
      <div className="num">{String(label.number).padStart(3, '0')}</div>
      <div className="room">{label.room}</div>
      <div className="qr">
        <QRCodeSVG value={boxUrl(label.qr_path)} size={size} level="M" />
      </div>
      <div className="label-footer"><span>↑↑ ВЕРХ</span><span>{label.project_name}</span></div>
      {label.items_preview.length > 0 ? <div className="muted small">{label.items_preview.join(' · ')}</div> : null}
    </div>
  )
}
