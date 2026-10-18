import { useEffect, useId, useRef, useState } from 'react'
import BoxContentsPopover, { type BoxPreviewAnchor } from './BoxContentsPopover'
import { boxContentsText } from '../ui/boxContents'
import { ArrowUpRight } from 'lucide-react'
import type { Box } from '../api/types'
import { plural } from '../ui/format'
import { BoxLink } from '../features/boxes/BoxNavigation'
import CartonLid from './CartonLid'
import { roomStyle } from '../ui/roomTheme'
import StatusBadge from '../ui/StatusBadge'
import type { BoxMove } from '../features/boxes/boxMoveEvents'
import { locationFor } from '../features/boxes/boxLocations'
import './BoxShelf.css'

function previewAnchorFor(element: HTMLAnchorElement): BoxPreviewAnchor {
  const rect = element.getBoundingClientRect()
  const shelf = element.closest('.box-shelf')?.getBoundingClientRect()
  // Follow the actual shelf columns, including responsive two/three-column layouts.
  const side = shelf && shelf.width > rect.width * 1.4
    ? rect.left + rect.width / 2 < shelf.left + shelf.width / 2 ? 'left' : 'right'
    : rect.left > document.documentElement.clientWidth - rect.right ? 'left' : 'right'
  return { rect, side }
}

function Carton({ pid, box, motion }: { pid: string; box: Box; motion?: BoxMove | null }) {
  const open = box.status === 'packing' || box.status === 'unpacked'
  const [previewAnchor, setPreviewAnchor] = useState<BoxPreviewAnchor | null>(null)
  const previewId = useId()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function clearTimer() { clearTimeout(timer.current) }
  function closePreview() { clearTimer(); setPreviewAnchor(null) }
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <>
    <BoxLink aria-describedby={previewAnchor ? previewId : undefined} onPointerEnter={event => { if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return; clearTimer(); const element = event.currentTarget; timer.current = setTimeout(() => setPreviewAnchor(previewAnchorFor(element)), 220) }} onPointerLeave={closePreview} onFocus={event => { if (!event.currentTarget.matches(':focus-visible') || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return; clearTimer(); setPreviewAnchor(previewAnchorFor(event.currentTarget)) }} onBlur={closePreview} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); closePreview() } }} pid={pid} number={box.number} data-box-location={locationFor(box.status)} data-box-status={box.status} className={`shelf-carton shelf-carton--${box.status} ${open ? 'shelf-carton--open' : 'shelf-carton--sealed'}`} style={roomStyle(box.room)}>
      <CartonLid status={box.status} closing={motion?.number === box.number && motion.to === 'packed'} opening={motion?.number === box.number && motion.to === 'unpacked'} className="shelf-carton__lid" />
      <div className="shelf-carton__label">
        <div className="shelf-carton__identity">
          <span className="shelf-carton__number">{String(box.number).padStart(3, '0')}</span>
          <StatusBadge status={box.status} />
        </div>
        <h2>{box.room}</h2>
        <p className="shelf-carton__contents">{boxContentsText(box)}</p>
        <p className="shelf-carton__action"><span>{box.items_count} {plural(box.items_count, ['позиция', 'позиции', 'позиций'])}{box.items_count > 3 ? ` · ещё ${box.items_count - 3}` : ''}</span><ArrowUpRight aria-hidden="true" /></p>
      </div>
      <span className="shelf-carton__staples" aria-hidden="true" />
      <span className="shelf-carton__marks" aria-hidden="true"><span>↑↑</span><img src="/assets/packing-bars.svg" alt="" /></span>
    </BoxLink>
    {previewAnchor ? <BoxContentsPopover id={previewId} pid={pid} number={box.number} room={box.room} anchor={previewAnchor} onClose={closePreview} /> : null}
    </>
  )
}

/** Each grid cell owns its shelf segment, so shelves always follow responsive rows. */
export default function BoxShelf({ pid, boxes, compact = false, motion }: { pid: string; boxes: Box[]; compact?: boolean; motion?: BoxMove | null }) {
  if (boxes.length === 0) return null
  return <div className={`shelf-container${compact ? ' shelf-container--compact' : ''}`}><div className="box-shelf">
    {boxes.map((box) => <div className="box-shelf__slot" key={box.number}><Carton pid={pid} box={box} motion={motion} /></div>)}
    {boxes.length % 2 ? <div className="box-shelf__slot box-shelf__empty box-shelf__empty--two" aria-hidden="true" /> : null}
    {Array.from({ length: (3 - boxes.length % 3) % 3 }, (_, index) => <div key={`empty-${index}`} className="box-shelf__slot box-shelf__empty box-shelf__empty--three" aria-hidden="true" />)}
  </div></div>
}
