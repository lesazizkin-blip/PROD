import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/endpoints'
import type { Box, BoxStatus, RoomProgress } from '../../api/types'
import { canAdvanceBox } from '../../components/statusOptions'
import { useAsync } from '../../state/useAsync'
import { useAction } from '../../state/useAction'
import ErrorAlert from '../../ui/ErrorAlert'
import StateView from '../../ui/StateView'
import ProgressBar from '../../ui/ProgressBar'
import StatusBadge from '../../ui/StatusBadge'
import Pagination from '../../ui/Pagination'
import { boxPath } from '../../ui/format'
import { recordBoxMove } from './boxMoveEvents'
import './loading-checklist.css'

export default function RoomLoadingChecklist({ pid, room, onChanged }: { pid: string; room: RoomProgress; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  return <details className="card room-loading stack" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>
      <b>{room.room} · {room.total} кор.</b>
      <span className="small muted">Погружено {room.loaded} из {room.total} · распаковано {room.unpacked} из {room.total}</span>
      <ProgressBar value={room.loaded_percent} label={`${room.room}: погружено`} color="var(--st-loaded)" />
      <ProgressBar value={room.unpacked_percent} label={`${room.room}: распаковано`} color="var(--st-unpacked)" />
      <span className="muted small">Открыть чек-лист коробок</span>
    </summary>
    {open ? <RoomBoxes pid={pid} room={room.room} onChanged={onChanged} /> : null}
  </details>
}

function RoomBoxes({ pid, room, onChanged }: { pid: string; room: string; onChanged: () => void }) {
  const [page, setPage] = useState(1)
  const boxes = useAsync(() => api.boxes(pid, { room, page, page_size: 36 }), [pid, room, page], { refreshOnFocus: true })
  const { busy, error, run } = useAction(() => { boxes.reload(); onChanged() })
  const list = boxes.data?.items ?? []
  const ready = list.filter(b => b.status === 'packed')
  const loaded = list.filter(b => b.status === 'loaded')
  function advance(box: Box, to: BoxStatus) {
    if (!canAdvanceBox(box.status, to)) return
    boxes.mutate(data => data ? { ...data, items: data.items.map(b => b.number === box.number ? { ...b, status: to } : b) } : data)
    void run(async () => { try { await api.transition(pid, box.number, to); recordBoxMove(pid, box, to) } catch (e) { boxes.reload(); throw e } })
  }
  return <div className="stack loading-boxes">
    <p className="small muted">Отметьте погрузку собранных коробок. Доставку можно отметить после погрузки; ошибочную отметку исправьте в карточке коробки.</p>
    <ErrorAlert message={error} />
    <StateView loading={boxes.loading && !boxes.data} error={boxes.error} onRetry={boxes.reload} empty={boxes.data?.total === 0} emptyText="В комнате пока нет коробок.">
      <ul className="plain">{list.map(box => <li key={box.number} className="loading-box-row">
        <label className="loading-check"><input type="checkbox" className="check" aria-label={`Погрузить коробку № ${box.number}`} checked={['loaded', 'delivered', 'unpacked'].includes(box.status)} disabled={busy || box.status !== 'packed'} onChange={() => advance(box, 'loaded')} /></label>
        <Link to={boxPath(pid, box.number)}>Коробка {String(box.number).padStart(3, '0')}</Link>
        <StatusBadge status={box.status} />
        {box.status === 'loaded' ? <button disabled={busy} onClick={() => advance(box, 'delivered')}>Доставлена</button> : box.status === 'packing' ? <span className="small muted">Сначала соберите</span> : null}
      </li>)}</ul>
      <div className="row wrap">
        {ready.length ? <button disabled={busy} onClick={() => void run(async () => { await api.bulkTransition(pid, ready.map(b => b.number), 'loaded'); if (ready[0]) recordBoxMove(pid, ready[0], 'loaded') })}>Погрузить готовые на странице ({ready.length})</button> : null}
        {loaded.length ? <button disabled={busy} onClick={() => void run(async () => { await api.bulkTransition(pid, loaded.map(b => b.number), 'delivered'); if (loaded[0]) recordBoxMove(pid, loaded[0], 'delivered') })}>Доставлены все погруженные на странице ({loaded.length})</button> : null}
      </div>
    </StateView>
    <Pagination page={page} pageSize={36} total={boxes.data?.total ?? 0} busy={boxes.loading || busy} onChange={setPage} label={`Коробки: ${room}`} />
  </div>
}
