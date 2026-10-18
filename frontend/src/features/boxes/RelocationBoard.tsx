import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Home, Truck, PackageCheck } from 'lucide-react'
import type { Box, Page, Progress } from '../../api/types'
import { api } from '../../api/endpoints'
import BoxShelf from '../../components/BoxShelf'
import { useAsync } from '../../state/useAsync'
import StateView from '../../ui/StateView'
import Pagination from '../../ui/Pagination'
import { BOX_LOCATIONS, LOCATION_LABELS, LOCATION_PAGE_SIZE, locationCounts, type BoxLocation, type LocationBoxes, type LocationPages } from './boxLocations'
import { useBoxMoveEvent, type BoxMove } from './boxMoveEvents'
import MovingTruck from './MovingTruck'
import './relocation.css'

const ICONS = { old: Home, truck: Truck, new: PackageCheck }
const DESCRIPTIONS = { old: 'Собираем и готовим к погрузке', truck: 'Погружены. Ждут подтверждения доставки', new: 'Доставлены и готовы к распаковке' }
const EMPTY = { old: 'На старом месте коробок нет. Новые коробки появятся здесь.', truck: 'Машина пока свободна. Погрузите собранные коробки со старого стеллажа.', new: 'Здесь будут доставленные коробки. Они появятся после подтверждения доставки.' }

export default function RelocationBoard({ pid, room, summary, place, onPlace, pages, onPage, initialData, onCache, onChanged }: {
  pid: string; room: string | null; summary: Progress | null; place: BoxLocation; onPlace: (place: BoxLocation) => void
  pages: LocationPages; onPage: (place: BoxLocation, page: number) => void; initialData?: LocationBoxes
  onCache: (data: LocationBoxes) => void; onChanged: () => void
}) {
  const old = useAsync(() => api.boxes(pid, { location: 'old', room: room ?? undefined, page: pages.old, page_size: LOCATION_PAGE_SIZE }), [pid, room, pages.old], { refreshOnFocus: true, initialData: initialData?.old })
  const truck = useAsync(() => api.boxes(pid, { location: 'truck', room: room ?? undefined, page: pages.truck, page_size: LOCATION_PAGE_SIZE }), [pid, room, pages.truck], { refreshOnFocus: true, initialData: initialData?.truck })
  const arrived = useAsync(() => api.boxes(pid, { location: 'new', room: room ?? undefined, page: pages.new, page_size: LOCATION_PAGE_SIZE }), [pid, room, pages.new], { refreshOnFocus: true, initialData: initialData?.new })
  const move = useBoxMoveEvent()
  const [expiredMotionId, setExpiredMotionId] = useState<number | null>(null)
  const motion = move?.pid === pid && !move.correction && move.id !== expiredMotionId ? move : null
  const reloadOld = old.reload, reloadTruck = truck.reload, reloadNew = arrived.reload
  useEffect(() => {
    if (!move || move.pid !== pid) return
    reloadOld(); reloadTruck(); reloadNew(); onChanged()
    const timer = setTimeout(() => setExpiredMotionId(move.id), 1700)
    return () => clearTimeout(timer)
  }, [move, pid, reloadOld, reloadTruck, reloadNew, onChanged])
  useLayoutEffect(() => { onCache({ old: old.data, truck: truck.data, new: arrived.data }) }, [old.data, truck.data, arrived.data, onCache])
  const lists = { old, truck, new: arrived }
  const totals = locationCounts(summary)
  const previousPlace = useRef(place)
  useLayoutEffect(() => {
    if (previousPlace.current === place) return
    previousPlace.current = place
    if (window.innerWidth < 800) return
    const heading = document.getElementById(`rack-heading-${place}`)
    heading?.scrollIntoView?.({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'instant' : 'smooth' })
    heading?.focus({ preventScroll: true })
  }, [place])

  return <section className={`relocation-board relocation-board--${place}`} aria-label="Коробки по местам">
    <div className="relocation-route" role="group" aria-label="Место коробок">
      {BOX_LOCATIONS.map(location => {
        const Icon = ICONS[location]
        const total = room ? lists[location].data?.total : summary ? totals[location] : undefined
        return <button type="button" id={`place-${location}`} key={location} className={`relocation-stop${place === location ? ' is-selected' : ''}`} aria-pressed={place === location} aria-controls={`rack-${location}`} onClick={() => onPlace(location)}>
          <Icon aria-hidden className="icon" /><span>{LOCATION_LABELS[location]}<b>{total ?? '…'}</b></span>
        </button>
      })}
      <div key={move?.id ?? 0} className={`relocation-route__truck${move?.pid === pid && move.to === 'delivered' && !move.correction ? ' is-delivering' : ''}`} aria-hidden><MovingTruck cargo={totals.truck > 0} /></div>
    </div>
    <div className="relocation-racks">
      {BOX_LOCATIONS.map(location => <LocationRack key={location} pid={pid} location={location} selected={place === location} data={lists[location]} page={pages[location]} onPage={page => onPage(location, page)} motion={motion} />)}
    </div>
    <p className="relocation-footnote muted small">{room ? `Комната «${room}». ` : ''}Расположение меняется вместе со статусом коробки. Поездка — после подтверждения доставки.</p>
  </section>
}

function LocationRack({ pid, location, selected, data, page, onPage, motion }: {
  pid: string; location: BoxLocation; selected: boolean; data: ReturnType<typeof useAsync<Page<Box>>>; page: number
  onPage: (page: number) => void; motion: BoxMove | null
}) {
  const total = data.data?.total ?? 0
  useEffect(() => {
    const last = Math.max(1, Math.ceil(total / LOCATION_PAGE_SIZE))
    if (!data.loading && data.data && page > last) onPage(last)
  }, [total, data.loading, data.data, page, onPage])
  return <section id={`rack-${location}`} className={`relocation-rack relocation-rack--${location}${selected ? ' is-selected' : ''}`} aria-labelledby={`rack-heading-${location}`}>
    <header className="relocation-rack__heading"><div><h2 id={`rack-heading-${location}`} tabIndex={-1}>{LOCATION_LABELS[location]}</h2><p>{DESCRIPTIONS[location]}</p></div><span className="relocation-rack__count" aria-label={`Всего: ${total}`}>{data.data ? total : '…'}</span></header>
    <StateView loading={data.loading && !data.data} error={data.error} onRetry={data.reload}>
      {data.data && total > 0 ? <BoxShelf pid={pid} boxes={data.data.items} compact motion={motion} /> : data.data ? <div className="relocation-empty">
        {location === 'truck' ? <MovingTruck /> : <div className="relocation-empty__shelf" aria-hidden><span /><span /></div>}
        <p>{EMPTY[location]}</p>
      </div> : null}
      <Pagination page={Math.min(page, Math.max(1, Math.ceil(total / LOCATION_PAGE_SIZE)))} pageSize={LOCATION_PAGE_SIZE} total={total} busy={data.loading} onChange={onPage} label={`Страницы: ${LOCATION_LABELS[location]}`} />
    </StateView>
  </section>
}
