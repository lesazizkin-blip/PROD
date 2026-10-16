import { QRCodeSVG } from 'qrcode.react'
import type { Label } from '../api/types'
import { boxUrl } from '../ui/format'

/** Этикетка: крупный номер, комната и QR-код. QR строится в браузере, внешних сервисов нет. */
export default function LabelSheet({ label, size = 240 }: { label: Label; size?: number }) {
  return (
    <div className="label-sheet">
      <div className="num">{label.number}</div>
      <div className="room">{label.room}</div>
      <div className="qr">
        <QRCodeSVG value={boxUrl(label.qr_path)} size={size} level="M" />
      </div>
      <div className="muted">{label.project_name}</div>
      {label.items_preview.length > 0 ? <div className="muted small">{label.items_preview.join(' · ')}</div> : null}
    </div>
  )
}
