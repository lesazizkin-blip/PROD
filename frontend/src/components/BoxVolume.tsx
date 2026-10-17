import type { BoxStatus } from '../api/types'
import './BoxVolume.css'

/** A small status illustration; the API status remains the source of truth. */
export default function BoxVolume({ status, closing = false }: { status: BoxStatus; closing?: boolean }) {
  const sealed = status !== 'packing' && status !== 'unpacked'
  return (
    <span className={`box-volume${closing ? ' is-closing' : sealed ? ' is-sealed' : ''}`} aria-hidden="true">
      <span className="bv-object">
        <span className="bv-face bv-back" /><span className="bv-face bv-left" />
        <span className="bv-face bv-right" /><span className="bv-face bv-bottom" />
        <span className="bv-face bv-front"><span className="bv-label">↑↑</span></span>
        <span className="bv-face bv-flap bv-flap-back" />
        <span className="bv-face bv-flap bv-flap-front" />
        <span className="bv-tape" /><span className="bv-tape-end" />
        <span className="bv-roll"><svg className="bv-roll-wheel" viewBox="0 0 48 48"><circle cx="26" cy="24" r="20" fill="#757d7b" /><circle cx="22" cy="24" r="20" fill="#abb0ae" stroke="#828987" strokeWidth="1" /><circle cx="22" cy="24" r="15" fill="none" stroke="#c5c9c7" strokeWidth="1" /><circle cx="22" cy="24" r="9" fill="#e7d8bb" stroke="#77776b" strokeWidth="3" /><path d="M22 6 A18 18 0 0 1 35 12" fill="none" stroke="#dce0dd" strokeWidth="2" /></svg></span>
      </span>
    </span>
  )
}
