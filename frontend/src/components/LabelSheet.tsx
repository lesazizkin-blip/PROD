import { QRCodeSVG } from 'qrcode.react'
import type { CSSProperties } from 'react'
import type { Label } from '../api/types'
import type { PrintTemplate } from '../features/labels/print/layout'
import { roomStyle } from '../ui/roomTheme'
import { boxUrl } from '../ui/format'
import '../features/labels/print/print.css'

/** One renderer for every preview and printed label. QR size includes its quiet zone. */
export default function LabelSheet({ label, size = 128, template = 'standard', qrMm = 34, writing = false, qrPayload }: {
  label: Label; size?: number; template?: PrintTemplate; qrMm?: number; writing?: boolean
  /** Integrator supplies the agreed server payload here when compact QR is available. */
  qrPayload?: string
}) {
  const hasQr = template !== 'no-qr'
  const notes = template === 'notes' || (template === 'no-qr' && writing)
  return (
    <article className={`mm-label mm-label--${template}${notes ? ' mm-label--writing' : ''}`} style={{ ...roomStyle(label.room), '--qr-mm': `${qrMm}mm`, '--number-digits': String(label.number).padStart(3, '0').length } as CSSProperties} aria-label={`Этикетка коробки ${label.number}`}>
      {template !== 'qr-only' ? <div className="mm-label-text">
        <span className="mm-label-brand">MOVERMATE</span>
        <div className="mm-label-number">{String(label.number).padStart(3, '0')}</div>
        <div className="mm-label-room" title={label.room}>{label.room}</div>
      </div> : null}
      {hasQr ? <div className="mm-label-qr"><QRCodeSVG value={qrPayload ?? boxUrl(label.qr_path)} size={size} marginSize={4} level="M" bgColor="#ffffff" fgColor="#000000" /></div> : null}
      {notes ? <div className="mm-label-writing" aria-label="Поле для заметок от руки" /> : null}
    </article>
  )
}
