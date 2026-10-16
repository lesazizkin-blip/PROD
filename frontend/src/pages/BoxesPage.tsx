import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import type { Box } from '../api/types'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import { STATUS_LABELS, boxPath, plural } from '../ui/format'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'

export default function BoxesPage() {
  return <RequireProject>{(pid) => <Boxes pid={pid} />}</RequireProject>
}

function BoxRow({ pid, box }: { pid: string; box: Box }) {
  return (
    <Link to={boxPath(pid, box.number)} className="list-row">
      <span aria-hidden>📦</span>
      <span className="grow">
        <b>№ {box.number} · {box.room}</b>
        <span className="sub" style={{ display: 'block' }}>
          {box.items_count} {plural(box.items_count, ['вещь', 'вещи', 'вещей'])}{box.fill_later && box.items_count === 0 ? ' · заполнить позже' : ''}
        </span>
      </span>
      <StatusBadge status={box.status} />
    </Link>
  )
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
      <input type="search" placeholder="Найти вещь или коробку по номеру" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Поиск" />

      {q ? (
        <>
          {numberMatch ? <div className="card flush"><BoxRow pid={pid} box={numberMatch} /></div> : null}
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
                      <span className="sub" style={{ display: 'block' }}>Коробка № {h.box_number} · {h.room}</span>
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
          <div className="card flush">{visible.map((b) => <BoxRow key={b.number} pid={pid} box={b} />)}</div>
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(room.trim(), text, later)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Новая коробка" onClose={onClose} dirty={room.trim() !== '' || text.trim() !== ''}>
      <form className="stack" onSubmit={submit}>
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
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || !room.trim()}>Создать</button>
      </form>
    </Modal>
  )
}
