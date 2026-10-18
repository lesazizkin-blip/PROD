import { useLayoutEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Camera } from 'lucide-react'
import { api } from '../api/endpoints'
import type { RoomPlan } from '../api/types'
import PhotoPicker from '../components/PhotoPicker'
import Modal from '../components/Modal'
import BoxGrid from '../components/BoxShelf'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import ErrorAlert from '../ui/ErrorAlert'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { roomStyle } from '../ui/roomTheme'
import { STATUS_LABELS, boxNumberFromInput, boxPath, plural } from '../ui/format'
import { BoxLink, useBoxNavigation } from '../features/boxes/BoxNavigation'
import { mergeRoomBoxes } from '../features/boxes/mergeRoomBoxes'
import Pagination from '../ui/Pagination'

export default function BoxesPage() {
  return <RequireProject>{(pid) => <Boxes key={pid} pid={pid} />}</RequireProject>
}

/** Подсветка найденного фрагмента в названии вещи. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())
  if (at < 0 || !query) return <>{text}</>
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + query.length)}</mark>{text.slice(at + query.length)}</>
}

function Boxes({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const navigation = useBoxNavigation()
  const [saved] = useState(() => navigation.shelfView(pid))
  const [query, setQuery] = useState(saved?.query ?? '')
  const q = useDebounced(query.trim())
  const [room, setRoom] = useState<string | null>(saved?.room ?? null)
  const [page, setPage] = useState(saved?.page ?? 1)
  const [adding, setAdding] = useState(false)
  const [roomPhoto, setRoomPhoto] = useState(false)

  const boxes = useAsync(() => api.boxes(pid, { page_size: 36, page, ...(room ? { room } : {}) }), [pid, room, page], { refreshOnFocus: true, initialData: saved?.boxes })
  // поиск вещи идёт по всем комнатам: чипы комнат при поиске скрыты, и фильтр был бы незаметен
  const hits = useAsync(() => (q ? api.search(pid, q, { page_size: 50, page }) : Promise.resolve(null)), [pid, q, page], { refreshOnFocus: true, initialData: saved?.hits })
  const summary = useAsync(() => api.progress(pid), [pid], { refreshOnFocus: true, initialData: saved?.summary })
  // Поиск коробки по номеру: если запрос - число, показываем коробку с этим номером
  // «17», «#017», «№ 17» или ссылка из QR этого проекта
  const typedNumber = boxNumberFromInput(q, pid)
  const byNumber = useAsync(() => (typeof typedNumber === 'number' ? api.boxes(pid, { number: typedNumber }) : Promise.resolve(null)), [pid, typedNumber], { refreshOnFocus: true, initialData: saved?.byNumber })
  const reminders = useAsync(() => api.reminders(pid), [pid], { refreshOnFocus: true })
  const activeTotal = q ? hits.data?.total : boxes.data?.total
  const activeLoading = q ? hits.loading : boxes.loading
  // A deletion in another tab can remove the last page. Adjust before drawing
  // an invalid pager; the next render refetches the remaining last page.
  if (!activeLoading && activeTotal !== undefined) {
    const last = Math.max(1, Math.ceil(activeTotal / (q ? 50 : 36)))
    if (page > last) setPage(last)
  }

  useLayoutEffect(() => () => {
    navigation.rememberShelf({ pid, query, room, page, scrollY: window.scrollY, boxes: boxes.data, hits: hits.data, byNumber: byNumber.data, summary: summary.data })
  }, [pid, query, room, page, boxes.data, hits.data, byNumber.data, summary.data, navigation])

  useLayoutEffect(() => { window.scrollTo({ top: saved?.scrollY ?? 0, behavior: 'instant' }) }, [saved])

  const all = boxes.data?.items ?? []
  const rooms = summary.data?.rooms ?? []
  const waiting = reminders.data ?? []
  const numberMatch = byNumber.data?.items[0]

  return (
    <>
      <PageHeading title="Коробки и вещи" mobileTitle="Коробки">{summary.data ? <>{summary.data.boxes_total} {plural(summary.data.boxes_total, ['коробка', 'коробки', 'коробок'])} · {summary.data.by_status.packing} ещё {plural(summary.data.by_status.packing, ['собирается', 'собираются', 'собираются'])}</> : '…'}</PageHeading>
      {/* без сети падают все запросы: одну и ту же ошибку показываем один раз - в списке ниже */}
      <ErrorAlert message={boxes.error || hits.error ? null : summary.error} />
      <div className="search-tools"><input type="search" maxLength={120} placeholder="Найти вещь или коробку по номеру" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} aria-label="Поиск" /><Link to="/scan" className="button">Сканировать QR</Link><button onClick={() => setRoomPhoto(true)}><Camera className="icon-sm" aria-hidden />Комната по фото</button><button className="primary" onClick={() => setAdding(true)}>+ Коробка</button></div>

      {q ? (
        <>
          {numberMatch ? <BoxGrid pid={pid} boxes={[numberMatch]} /> : null}
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
                  <BoxLink key={h.item_id} pid={pid} number={h.box_number} sourceId={`item-${h.item_id}`} className="list-row">
                    <span aria-hidden>{h.lost ? '⚠️' : '🔎'}</span>
                    <span className="grow">
                      <b><Highlight text={h.name} query={q} /></b>
                      <span className="sub">Коробка № {h.box_number} · {h.room}{h.lost ? ' · не могу найти' : ''}{h.damaged ? ' · повреждена' : ''}</span>
                    </span>
                    <StatusBadge status={h.status} />
                  </BoxLink>
                ))}
              </div>
            ) : null}
          </StateView>
          <Pagination page={page} pageSize={50} total={hits.data?.total ?? 0} busy={hits.loading} onChange={setPage} label="Страницы поиска" />
        </>
      ) : (
        <>
          {rooms.length > 1 ? <div className="chips" role="group" aria-label="Фильтр по комнатам">
            <button className={room === null ? 'chip on' : 'chip'} onClick={() => { setRoom(null); setPage(1) }}>Все комнаты · {summary.data?.boxes_total}</button>
            {rooms.map(r => <button key={r.room} className={room === r.room ? 'chip room-chip on' : 'chip room-chip'} style={roomStyle(r.room)} onClick={() => { setRoom(room === r.room ? null : r.room); setPage(1) }}>{r.room} · {r.total}</button>)}
          </div> : null}
        <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={boxes.data?.total === 0} emptyText={room ? 'В этой комнате пока нет коробок.' : 'Коробок пока нет. Нажмите «+ Коробка».'} emptyIcon="📦" onRetry={boxes.reload}>
          {waiting.length > 0 ? (
            <div className="banner">
              <span>Ждут описи содержимого: {waiting.map((r) => `№${r.box.number}`).join(', ')}</span>
              <BoxLink pid={pid} number={waiting[0].box.number} sourceId="reminder">Открыть</BoxLink>
            </div>
          ) : null}
          <BoxGrid pid={pid} boxes={all} />
          <p className="muted small">Статусы: {Object.values(STATUS_LABELS).join(' → ')}</p>
          <Link to="/tips" className="tips-card">
            <BookOpen className="icon" aria-hidden />
            <span className="grow">
              <b>Памятка по упаковке</b>
              <span className="sub">Хрупкое, что везти с собой, что паковать последним</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        </StateView>
        <Pagination page={page} pageSize={36} total={boxes.data?.total ?? 0} busy={boxes.loading} onChange={setPage} label="Страницы коробок" />
        </>
      )}
      {adding ? (
        <AddBoxModal
          rooms={rooms.map(r => r.room)}
          onClose={() => setAdding(false)}
          onSave={async (roomName, text, later) => {
            const box = await api.createBox(pid, { room: roomName, items_text: text || null, fill_later: later })
            navigate(boxPath(pid, box.number))
          }}
        />
      ) : null}
      {roomPhoto ? (
        <RoomPhotoModal
          pid={pid}
          rooms={rooms.map(r => r.room)}
          onClose={() => setRoomPhoto(false)}
          onCreated={() => {
            setRoomPhoto(false)
            boxes.reload()
            summary.reload()
            reminders.reload()
          }}
        />
      ) : null}
    </>
  )
}

/** Комната по фото: модель предлагает коробки с вещами, пользователь выбирает, какие создать. */
function RoomPhotoModal({ pid, rooms, onClose, onCreated }: { pid: string; rooms: string[]; onClose: () => void; onCreated: () => void }) {
  const [room, setRoom] = useState('')
  const [plan, setPlan] = useState<RoomPlan | null>(null)
  const [suggested, setSuggested] = useState<RoomPlan | null>(null)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const { busy, error, run } = useAction()

  const recognize = async (image: string) => {
    const result = await api.roomPlan(pid, room.trim(), image)
    setPlan(result)
    setSuggested(result)
    setChosen(new Set(result.boxes.map((_, i) => i)))
  }
  const merge = () => {
    if (!plan) return
    const { boxes, merged } = mergeRoomBoxes(plan.boxes, chosen)
    setPlan({ ...plan, boxes })
    setChosen(new Set([merged]))
  }
  const restore = () => {
    if (!suggested) return
    setPlan(suggested)
    setChosen(new Set(suggested.boxes.map((_, i) => i)))
  }
  const toggle = (i: number) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })
  const create = () =>
    run(async () => {
      for (const [i, box] of (plan?.boxes ?? []).entries()) {
        if (chosen.has(i)) await api.createBox(pid, { room: room.trim(), items_text: box.items.join('\n'), fill_later: false })
      }
      onCreated()
    })

  return (
    <Modal title="Разложить комнату по коробкам" onClose={onClose} dirty={plan !== null}>
      <p className="muted small">Сфотографируйте комнату: подскажем, какие коробки собрать и что в них положить. Коробки создадутся только после вашего выбора.</p>
      <label>
        Комната
        <input value={room} onChange={(e) => { setRoom(e.target.value); setPlan(null); setSuggested(null) }} maxLength={60} list="photo-rooms" placeholder="Кухня" data-autofocus />
        <datalist id="photo-rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
      </label>
      {room.trim() ? <PhotoPicker label="Сфотографировать комнату" busyLabel="Раскладываем по коробкам…" onPhoto={recognize} /> : null}
      {plan ? (
        plan.boxes.length === 0 ? <p className="muted">На фото не нашлось вещей для коробок. Попробуйте другой ракурс.</p> : (
          <div className="stack">
            <b>Предлагаем {plan.boxes.length} {plural(plan.boxes.length, ['коробку', 'коробки', 'коробок'])}</b>
            <ul className="plain room-plan">
              {plan.boxes.map((box, i) => (
                <li key={i}>
                  <label className="room-plan__box">
                    <input type="checkbox" checked={chosen.has(i)} onChange={() => toggle(i)} />
                    <span className="grow">
                      <b>{box.label}</b>
                      <span className="sub">{box.items.join(', ')}</span>
                      {box.tip ? <span className="sub room-plan__tip">{box.tip}</span> : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="room-plan__actions">
              <button type="button" disabled={busy || chosen.size < 2} onClick={merge}>
                {chosen.size < 2 ? 'Объединить отмеченные' : `Объединить отмеченные (${chosen.size}) в одну`}
              </button>
              {plan.boxes !== suggested?.boxes ? <button type="button" className="link" disabled={busy} onClick={restore}>Вернуть как предложено</button> : null}
            </div>
            <p className="muted small">Отметьте две коробки и больше, чтобы сложить их вещи в одну.</p>
            <ErrorAlert message={error} />
            <button className="primary" disabled={busy || chosen.size === 0} onClick={create}>
              {busy ? 'Создаём…' : `Создать коробки (${chosen.size})`}
            </button>
          </div>
        )
      ) : null}
    </Modal>
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
