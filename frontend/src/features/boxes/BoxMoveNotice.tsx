import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Home, Package, X } from 'lucide-react'
import { useBoxMoveEvent } from './boxMoveEvents'
import { locationFor, LOCATION_LABELS } from './boxLocations'
import MovingTruck from './MovingTruck'
import { STATUS_LABELS } from '../../ui/format'
import './relocation.css'

export default function BoxMoveNotice({ pid }: { pid: string | null }) {
  const move = useBoxMoveEvent()
  const [dismissed, setDismissed] = useState<number | null>(null)
  useEffect(() => {
    if (!move) return
    const timer = setTimeout(() => setDismissed(move.id), 3200)
    return () => clearTimeout(timer)
  }, [move])
  const visible = move && move.pid === pid && move.id !== dismissed
  return <div className="box-move-announcer" role="status" aria-live="polite" aria-atomic="true">
    {visible ? <div key={move.id} className={`box-move-notice box-move-notice--${move.correction ? 'correction' : move.to}`}>
      <div className="box-move-notice__scene" aria-hidden="true"><Home className="move-home move-home--old" /><span className="move-road" /><div className="move-vehicle"><MovingTruck cargo={move.to === 'loaded' || move.to === 'delivered'} /></div><Package className="move-parcel" /><Home className="move-home move-home--new" /><Check className="move-received" /></div>
      <div className="box-move-notice__copy"><b>Коробка {String(move.number).padStart(3, '0')} · {STATUS_LABELS[move.to]}</b><Link to="/boxes" state={{ boxPlace: locationFor(move.to) }}>Показать: {LOCATION_LABELS[locationFor(move.to)]}</Link></div>
      <button className="icon-link" aria-label="Скрыть подтверждение" onClick={() => setDismissed(move.id)}><X className="icon-sm" aria-hidden /></button>
    </div> : null}
  </div>
}
