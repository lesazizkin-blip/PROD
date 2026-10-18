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

function Carton({ pid, box, motion }: { pid: string; box: Box; motion?: BoxMove | null }) {
  const open = box.status === 'packing' || box.status === 'unpacked'
  return (
    <BoxLink pid={pid} number={box.number} data-box-location={locationFor(box.status)} data-box-status={box.status} className={`shelf-carton shelf-carton--${box.status} ${open ? 'shelf-carton--open' : 'shelf-carton--sealed'}`} style={roomStyle(box.room)}>
      <CartonLid status={box.status} closing={motion?.number === box.number && motion.to === 'packed'} opening={motion?.number === box.number && motion.to === 'unpacked'} className="shelf-carton__lid" />
      <div className="shelf-carton__label">
        <div className="shelf-carton__identity">
          <span className="shelf-carton__number">{String(box.number).padStart(3, '0')}</span>
          <StatusBadge status={box.status} />
        </div>
        <h2>{box.room}</h2>
        <p className="shelf-carton__action"><span>{box.items_count} {plural(box.items_count, ['позиция', 'позиции', 'позиций'])} · {box.fill_later && box.items_count === 0 ? 'заполнить позже' : 'посмотреть содержимое'}</span><ArrowUpRight aria-hidden="true" /></p>
      </div>
      <span className="shelf-carton__staples" aria-hidden="true" />
      <span className="shelf-carton__marks" aria-hidden="true"><span>↑↑</span><img src="/assets/packing-bars.svg" alt="" /></span>
    </BoxLink>
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
