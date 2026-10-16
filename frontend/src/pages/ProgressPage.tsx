import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import type { BoxStatus, Hint, LostItem } from '../api/types'
import { BOX_STATUSES } from '../api/types'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import { STATUS_LABELS, boxPath } from '../ui/format'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'

// Для комнаты: какие коробки можно сдвинуть дальше одной кнопкой (погрузка, доставка, распаковка)
const ROOM_STEPS: { from: BoxStatus; to: BoxStatus; label: string }[] = [
  { from: 'packed', to: 'loaded', label: 'Погрузить' },
  { from: 'loaded', to: 'delivered', label: 'Доставлено' },
  { from: 'delivered', to: 'unpacked', label: 'Распаковано' },
]

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
  const [error, setError] = useState<string | null>(null)
  const [hints, setHints] = useState<{ name: string; list: Hint[] } | null>(null)

  const reloadAll = () => {
    progress.reload()
    lost.reload()
  }

  async function moveRoom(room: string, from: BoxStatus, to: BoxStatus) {
    setError(null)
    try {
      const boxes = await api.boxes(pid, { room, status: from, page_size: 200 })
      await api.bulkTransition(pid, boxes.items.map((b) => b.number), to)
      reloadAll()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function showHints(entry: LostItem) {
    setError(null)
    try {
      setHints({ name: entry.item.name, list: await api.hints(pid, entry.item.id) })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const p = progress.data
  const lostList = lost.data ?? []

  return (
    <StateView loading={progress.loading && !p} error={progress.error} empty={!!p && p.boxes_total === 0} emptyText="Коробок пока нет: прогресс появится после первой коробки" emptyIcon="📊" onRetry={reloadAll}>
      {p ? (
        <>
          <div className="card hero stack">
            <div style={{ fontSize: '2.4rem', fontWeight: 700, lineHeight: 1 }}>{p.boxes_total}</div>
            <div>коробок · распаковано {Math.round(p.unpacked_percent)}%</div>
            <div className="progress"><span style={{ width: `${p.unpacked_percent}%` }} /></div>
          </div>
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <div className="stat-grid">
            {BOX_STATUSES.map((s) => (
              <div key={s} className="stat" style={{ borderLeftColor: `var(--st-${s})` }}>
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
              <div className="progress"><span style={{ width: `${r.loaded_percent}%`, background: 'var(--st-loaded)' }} /></div>
              <div className="small muted">Распаковано {r.unpacked} из {r.total}</div>
              <div className="progress"><span style={{ width: `${r.unpacked_percent}%`, background: 'var(--st-unpacked)' }} /></div>
              <div className="row wrap">
                {ROOM_STEPS.filter((s) => r.by_status[s.from] > 0).map((s) => (
                  <button key={s.to} className="tonal small" onClick={() => moveRoom(r.room, s.from, s.to)}>
                    {s.label} ({r.by_status[s.from]})
                  </button>
                ))}
              </div>
            </div>
          ))}

          <SectionTitle>Потерянные вещи</SectionTitle>
          <div className="card flush">
            {lostList.length === 0 ? <div className="list-row muted">Ничего не потеряно</div> : null}
            {lostList.map((entry) => (
              <div key={entry.item.id} className="list-row">
                <span aria-hidden>⚠️</span>
                <span className="grow">
                  <b>{entry.item.name}</b>
                  <span className="sub" style={{ display: 'block' }}>Коробка № {entry.box_number} · {entry.room}</span>
                </span>
                <button className="small" onClick={() => showHints(entry)}>Где искать</button>
              </div>
            ))}
          </div>
          <p className="muted small">Пометить вещь потерянной можно в карточке коробки.</p>
        </>
      ) : null}

      {hints ? (
        <Modal title={`Где искать: ${hints.name}`} onClose={() => setHints(null)}>
          {hints.list.length === 0 ? <p className="muted">Подходящих нераспакованных коробок нет.</p> : null}
          <div className="card flush">
            {hints.list.map((h) => (
              <button key={h.box_number} className="list-row" onClick={() => navigate(boxPath(pid, h.box_number))}>
                <span className="grow">
                  <b>Коробка № {h.box_number} · {h.room}</b>
                  <span className="sub" style={{ display: 'block' }}>{REASONS[h.reason] ?? h.reason}</span>
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
