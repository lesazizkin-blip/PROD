import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../api/endpoints'
import type { Box } from '../api/types'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import ErrorAlert from '../ui/ErrorAlert'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { STATUS_LABELS, boxPath, plural } from '../ui/format'

export default function BoxesPage() {
  return <RequireProject>{(pid) => <Boxes pid={pid} />}</RequireProject>
}

// номер коробки крупно и моноширинно: #014
const boxNo = (n: number) => `#${String(n).padStart(3, '0')}`

function BoxCard({ pid, box }: { pid: string; box: Box }) {
  const waiting = box.fill_later && box.items_count === 0
  return (
    <Link to={boxPath(pid, box.number)} className={`box-card st-card-${box.status}`} aria-label={`Коробка № ${box.number}, ${box.room}`}>
      <span className="row between">
        <span className="box-card__no">{boxNo(box.number)}</span>
        <StatusBadge status={box.status} />
      </span>
      <span className="room-tag" style={{ ['--tag' as string]: roomHue(box.room) }}>{box.room}</span>
      <span className="muted small">{box.items_count} {plural(box.items_count, ['вещь', 'вещи', 'вещей'])}</span>
      {waiting ? <span className="awaiting">⚠️ Ожидает описи</span> : null}
    </Link>
  )
}

/** Пастельный цвет метки комнаты: одна и та же комната всегда одного цвета. */
function roomHue(room: string): string {
  let h = 0
  for (const ch of room) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `${h}`
}

/** Подсветка найденного фрагмента в названии вещи. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0 || !query) return <>{text}</>
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length)}</>
}

function Boxes({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const [room, setRoom] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const boxes = useAsync(() => api.boxes(pid, { page_size: 200 }), [pid])
  const hits = useAsync(() => (q ? api.search(pid, q, { page_size: 100 }) : Promise.resolve(null)), [pid, q])
  // Поиск коробки по номеру: если запрос - число, показываем коробку с этим номером
  const byNumber = useAsync(() => (/^\d+$/.test(q) ? api.boxes(pid, { number: Number(q) }) : Promise.resolve(null)), [pid, q])
  const reminders = useAsync(() => api.reminders(pid), [pid])

  const all = boxes.data?.items ?? []
  const rooms = Array.from(new Set(all.map((b) => b.room))).sort()
  const visible = room ? all.filter((b) => b.room === room) : all
  const waiting = reminders.data ?? []
  const numberMatch = byNumber.data?.items[0]

  return (
    <>
      <div className="search-bar">
        <Search className="icon" aria-hidden />
        <input type="search" placeholder="Найти вещь или коробку по номеру" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск" />
      </div>

      {q ? (
        <>
          {numberMatch ? <div className="box-grid"><BoxCard pid={pid} box={numberMatch} /></div> : null}
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
                      <b><Highlight text={h.name} query={q} /></b>
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
              <button className={room === null ? 'chip on' : 'chip'} onClick={() => setRoom(null)}>Все</button>
              {rooms.map((r) => (
                <button key={r} className={room === r ? 'chip on' : 'chip'} onClick={() => setRoom(room === r ? null : r)}>{r}</button>
              ))}
            </div>
          ) : null}
          <div className="box-grid">{visible.map((b) => <BoxCard key={b.number} pid={pid} box={b} />)}</div>
          <p className="muted small">Статусы: {Object.values(STATUS_LABELS).join(' → ')}</p>
        </StateView>
      )}

      <button className="primary fab" onClick={() => setAdding(true)}>+ Коробка</button>
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
