import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { api } from '../api/endpoints'
import type { BoxStatus, Hint, LostItem, RoomProgress } from '../api/types'
import { BOX_STATUSES } from '../api/types'
import { TipList } from './TipsPage'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import StatusPickerModal from '../components/StatusPickerModal'
import { boxStatusOptions } from '../components/statusOptions'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import ProgressBar from '../ui/ProgressBar'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { BOX_STATUS_HINTS, STATUS_LABELS, boxPath } from '../ui/format'


const REASONS: Record<string, string> = {
  recorded: 'записана в этой коробке',
  similar_content: 'лежит похожее',
  same_room: 'та же комната',
}

export default function ProgressPage() {
  return <RequireProject>{(pid) => <ProgressView pid={pid} />}</RequireProject>
}

function ProgressView({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const progress = useAsync(() => api.progress(pid), [pid])
  const lost = useAsync<LostItem[]>(() => api.lostItems(pid), [pid])
  const { busy, error, run } = useAction()
  const [hints, setHints] = useState<{ name: string; list: Hint[] } | null>(null)
  const [roomPicking, setRoomPicking] = useState<RoomProgress | null>(null)
  const tips = useAsync(() => api.tips(), [])

  const reloadAll = () => {
    progress.reload()
    lost.reload()
  }

  // Все коробки комнаты, которые ещё не в выбранном статусе, переводятся в него одним запросом (всё или ничего)
  const moveRoom = async (room: string, to: BoxStatus) => {
    const boxes = await api.boxes(pid, { room, page_size: 200 })
    const numbers = boxes.items.filter((b) => b.status !== to).map((b) => b.number)
    if (numbers.length) await api.bulkTransition(pid, numbers, to)
    reloadAll()
  }

  const showHints = (entry: LostItem) =>
    run(async () => setHints({ name: entry.item.name, list: await api.hints(pid, entry.item.id) }))

  const p = progress.data
  const lostList = lost.data ?? []

  return (
    <StateView loading={progress.loading && !p} error={progress.error} empty={!!p && p.boxes_total === 0} emptyText="Коробок пока нет: прогресс появится после первой коробки" emptyIcon="📊" onRetry={reloadAll}>
      {p ? (
        <>
          <div className="card hero stack">
            <div style={{ fontSize: '2.4rem', fontWeight: 700, lineHeight: 1 }}>{p.boxes_total}</div>
            <div>коробок · распаковано {Math.round(p.unpacked_percent)}%</div>
            <ProgressBar value={p.unpacked_percent} label="Распаковано коробок" />
          </div>
          <ErrorAlert message={error} />

          <div className="stat-grid">
            {BOX_STATUSES.map((s) => (
              <div key={s} className={`stat st-${s}`}>
                <b>{p.by_status[s]}</b>
                <span>{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>

          <SectionTitle>По комнатам</SectionTitle>
          {p.rooms.map((r) => (
            <div key={r.room} className="card stack">
              <b>{r.room} · {r.total} кор.</b>
              <div className="small muted">Погружено {r.loaded} из {r.total}</div>
              <ProgressBar value={r.loaded_percent} label={`${r.room}: погружено`} color="var(--st-loaded-fg)" />
              <div className="small muted">Распаковано {r.unpacked} из {r.total}</div>
              <ProgressBar value={r.unpacked_percent} label={`${r.room}: распаковано`} />
              <div className="row wrap">
                <button className="tonal small" disabled={busy} onClick={() => setRoomPicking(r)}>Отметить коробки комнаты</button>
              </div>
            </div>
          ))}

          <FirstDayWidget pid={pid} />

          <SectionTitle>Потерянные вещи</SectionTitle>
          <div className="card flush">
            {lostList.length === 0 ? <div className="list-row muted">Ничего не потеряно</div> : null}
            {lostList.map((entry) => (
              <div key={entry.item.id} className="list-row">
                <span aria-hidden>⚠️</span>
                <span className="grow">
                  <b>{entry.item.name}</b>
                  <span className="sub">Коробка № {entry.box_number} · {entry.room}</span>
                </span>
                <button className="small" disabled={busy} onClick={() => showHints(entry)}>Где искать</button>
              </div>
            ))}
          </div>
          <p className="muted small">Пометить вещь потерянной можно в карточке коробки.</p>

          <SectionTitle>Памятка</SectionTitle>
          <TipList tips={tips.data ?? []} />
        </>
      ) : null}

      {roomPicking ? (
        <StatusPickerModal
          title={`${roomPicking.room}: все коробки (${roomPicking.total})`}
          options={boxStatusOptions((s) => ({
            hint: roomPicking.by_status[s] ? `${BOX_STATUS_HINTS[s]} · сейчас ${roomPicking.by_status[s]} из ${roomPicking.total}` : BOX_STATUS_HINTS[s],
            disabled: roomPicking.by_status[s] === roomPicking.total,
          }))}
          onPick={(to) => moveRoom(roomPicking.room, to)}
          onClose={() => setRoomPicking(null)}
        />
      ) : null}

      {hints ? (
        <Modal title={`Где искать: ${hints.name}`} onClose={() => setHints(null)}>
          {hints.list.length === 0 ? <p className="muted">Подходящих нераспакованных коробок нет.</p> : null}
          <div className="card flush">
            {hints.list.map((h) => (
              <button key={h.box_number} className="list-row" onClick={() => navigate(boxPath(pid, h.box_number))}>
                <span className="grow">
                  <b>Коробка № {h.box_number} · {h.room}</b>
                  <span className="sub">{REASONS[h.reason] ?? h.reason}</span>
                </span>
                <StatusBadge status={h.status} />
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </StateView>
  )
}

/** Чек-лист первого дня (раздел 5.4 ТЗ): что положить в коробку, которую откроете первой. Отметка срабатывает сразу. */
function FirstDayWidget({ pid }: { pid: string }) {
  const items = useAsync(() => api.firstDay(pid), [pid])
  const [error, setError] = useState<string | null>(null)
  const list = items.data ?? []
  const done = list.filter((i) => i.done).length
  if (!items.data) return null
  const toggle = (id: number, value: boolean) => {
    setError(null)
    items.mutate((xs) => xs?.map((x) => (x.id === id ? { ...x, done: value } : x)) ?? xs)
    api.updateFirstDay(pid, id, { done: value }).catch((e) => {
      setError(errorMessage(e))
      items.reload()
    })
  }
  return (
    <section className="card stack first-day">
      <div className="row between">
        <b>Чек-лист первого дня</b>
        <span className="muted small">{done} из {list.length}</span>
      </div>
      <ProgressBar value={done} max={list.length} label="Чек-лист первого дня" />
      <ul className="plain first-day__list">
        {list.map((i) => (
          <li key={i.id} className={i.done ? 'done' : ''}>
            <label className="row">
              <input type="checkbox" className="check" checked={i.done} onChange={() => toggle(i.id, !i.done)} />
              {i.title}
            </label>
          </li>
        ))}
      </ul>
      <ErrorAlert message={error} />
    </section>
  )
}
