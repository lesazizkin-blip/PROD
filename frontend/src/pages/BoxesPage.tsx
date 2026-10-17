import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Box } from '../api/types'
import Modal from '../components/Modal'
import BoxVolume from '../components/BoxVolume'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import ErrorAlert from '../ui/ErrorAlert'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { roomStyle, roomTheme } from '../ui/roomTheme'
import { STATUS_LABELS, boxPath, plural } from '../ui/format'

export default function BoxesPage() {
  return <RequireProject>{(pid) => <Boxes pid={pid} />}</RequireProject>
}

function BoxRow({ pid, box }: { pid: string; box: Box }) {
  return (
    <Link to={boxPath(pid, box.number)} className={`box-card ${box.status === 'packing' || box.status === 'unpacked' ? 'carton-open' : 'carton-sealed'}`} style={roomStyle(box.room)}>
      <span className="carton-lid" aria-hidden="true"><span /></span>
      <BoxVolume status={box.status} />
      <div className="box-card-header"><span className="box-number">{String(box.number).padStart(3, '0')}</span><StatusBadge status={box.status} /></div>
      <h2>{box.room}</h2>
      <p className="muted small">{box.items_count} {plural(box.items_count, ['вещь', 'вещи', 'вещей'])}{box.fill_later && box.items_count === 0 ? ' · заполнить позже' : ' · посмотреть содержимое →'}</p>
      <span className="eyebrow muted">↑↑ ВЕРХ</span>
      <img className="packing-tape" src={`/assets/${roomTheme(box.room).tape}`} alt="" />
      <img className="packing-bars" src="/assets/packing-bars.svg" alt="" />
    </Link>
  )
}

function Boxes({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const [room, setRoom] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const boxes = useAsync(() => api.boxes(pid, { page_size: 200 }), [pid], { refreshOnFocus: true })
  const hits = useAsync(() => (q ? api.search(pid, q, { page_size: 100 }) : Promise.resolve(null)), [pid, q], { refreshOnFocus: true })
  // Поиск коробки по номеру: если запрос - число, показываем коробку с этим номером
  const byNumber = useAsync(() => (/^\d+$/.test(q) ? api.boxes(pid, { number: Number(q) }) : Promise.resolve(null)), [pid, q], { refreshOnFocus: true })
  const reminders = useAsync(() => api.reminders(pid), [pid], { refreshOnFocus: true })

  const all = boxes.data?.items ?? []
  const rooms = Array.from(new Set(all.map((b) => b.room))).sort()
  const visible = room ? all.filter((b) => b.room === room) : all
  const waiting = reminders.data ?? []
  const numberMatch = byNumber.data?.items[0]

  return (
    <>
      <PageHeading title="Коробки и вещи" mobileTitle="Коробки">{boxes.data?.total ?? '…'} коробок · {all.filter((b) => b.status === 'packing').length} ещё собираются</PageHeading>
      <div className="search-tools"><input type="search" placeholder="Найти вещь или коробку по номеру" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск" /><Link to="/scan" className="button">Сканировать QR</Link><button className="primary" onClick={() => setAdding(true)}>+ Коробка</button></div>

      {q ? (
        <>
          {numberMatch ? <div className="box-grid"><BoxRow pid={pid} box={numberMatch} /></div> : null}
          <StateView
            loading={hits.loading && !hits.data}
            error={hits.error}
            empty={(hits.data?.items.length ?? 0) === 0 && !numberMatch}
            emptyText={`«${q}» не найдено`}
            emptyIcon="🔍"
            onRetry={hits.reload}
          >
            {(hits.data?.items.length ?? 0) > 0 ? (
              <div className="card flush">
                {hits.data?.items.map((h) => (
                  <Link key={h.item_id} to={boxPath(pid, h.box_number)} className="list-row">
                    <span aria-hidden>{h.lost ? '⚠️' : '🔎'}</span>
                    <span className="grow">
                      <b>{h.name}</b>
                      <span className="sub">Коробка № {h.box_number} · {h.room}</span>
                    </span>
                    <StatusBadge status={h.status} />
                  </Link>
                ))}
              </div>
            ) : null}
          </StateView>
        </>
      ) : (
        <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={all.length === 0} emptyText="Коробок пока нет. Нажмите «+ Коробка»." emptyIcon="📦" onRetry={boxes.reload}>
          {waiting.length > 0 ? (
            <div className="banner">
              <span>Ждут описи содержимого: {waiting.map((r) => `№${r.box.number}`).join(', ')}</span>
              <Link to={boxPath(pid, waiting[0].box.number)}>Открыть</Link>
            </div>
          ) : null}
          {rooms.length > 1 ? (
            <div className="chips" role="group" aria-label="Фильтр по комнатам">
              <button className={room === null ? 'chip on' : 'chip'} onClick={() => setRoom(null)}>Все комнаты · {all.length}</button>
              {rooms.map((r) => (
                <button key={r} className={room === r ? 'chip room-chip on' : 'chip room-chip'} style={roomStyle(r)} onClick={() => setRoom(room === r ? null : r)}>{r} · {all.filter((b) => b.room === r).length}</button>
              ))}
            </div>
          ) : null}
          <div className="box-grid">{visible.map((b) => <BoxRow key={b.number} pid={pid} box={b} />)}</div>
          <p className="muted small">Статусы: {Object.values(STATUS_LABELS).join(' → ')}</p>
        </StateView>
      )}

      <div className="packing-tip"><span aria-hidden>↑↑</span><p>Одну кружку оставьте снаружи. Кофе ещё понадобится.</p></div>
      {adding ? (
        <AddBoxModal
          rooms={rooms}
          onClose={() => setAdding(false)}
          onSave={async (roomName, text, later) => {
            const box = await api.createBox(pid, { room: roomName, items_text: text || null, fill_later: later })
            navigate(boxPath(pid, box.number))
          }}
        />
      ) : null}
    </>
  )
}

function AddBoxModal({ rooms, onClose, onSave }: { rooms: string[]; onClose: () => void; onSave: (room: string, text: string, fillLater: boolean) => Promise<void> }) {
  const [room, setRoom] = useState('')
  const [text, setText] = useState('')
  const [later, setLater] = useState(false)
  const { busy, error, submit } = useAction()

  return (
    <Modal title="Новая коробка" onClose={onClose} dirty={room.trim() !== '' || text.trim() !== ''}>
      <form className="stack" onSubmit={submit(() => onSave(room.trim(), text, later))}>
        <label>
          Комната назначения
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} list="rooms" placeholder="Кухня" data-autofocus />
          <datalist id="rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
        </label>
        <label>
          Содержимое (каждая вещь с новой строки)
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Чайник\nКружки (4 шт)'} />
        </label>
        <label className="row">
          <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
          Заполнить позже
        </label>
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !room.trim()}>Создать</button>
      </form>
    </Modal>
  )
}
