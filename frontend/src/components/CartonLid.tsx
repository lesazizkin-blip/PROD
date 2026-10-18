import { useId } from 'react'
import type { BoxStatus } from '../api/types'
import './CartonLid.css'

export default function CartonLid({ status, closing = false, opening = false, className = '' }: { status: BoxStatus; closing?: boolean; opening?: boolean; className?: string }) {
  const tapeId = useId()
  const open = status === 'packing' || status === 'unpacked'
  return <svg className={`carton-lid-art ${open ? 'is-open' : 'is-sealed'}${closing ? ' is-closing' : ''}${opening ? ' is-opening' : ''} ${className}`} viewBox="0 0 300 64" preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id={tapeId} width="1" height="1" viewBox="0 0 100 100" preserveAspectRatio="none"><image href="/assets/duct-tape-material.webp" x="0" y="-100" width="100" height="300" preserveAspectRatio="none" /></pattern></defs>
    <path className="shelf-carton__top" d="M0 64 14 44 300 44 286 64Z" />
    {open || closing ? <>
      <path className="shelf-carton__mouth" d="M0 64 14 44 300 44 286 64Z" />
      <path className="shelf-carton__flap carton-flap-left" d="M0 64 14 44 140 28 130 49Z" />
      <path className="shelf-carton__flap shelf-carton__flap--right carton-flap-right" d="M158 29 300 44 286 64 153 49Z" />
    </> : null}
    {!open || closing ? <g className="carton-lid-seal">
      <path className="shelf-carton__seam" d="M157 44 143 64" />
      <path className="shelf-carton__tape" fill={`url(#${tapeId})`} d="M146 44 171 44 157 64 132 64Z" />
    </g> : null}
  </svg>
}
