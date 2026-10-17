import FirstDayChecklist from '../features/planner/FirstDayChecklist'
import RoomLoadingChecklist from '../features/boxes/RoomLoadingChecklist'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Hint, LostItem } from '../api/types'
import { BOX_STATUSES } from '../api/types'
import Modal from '../components/Modal'
import JourneySummary from '../features/journey/JourneySummary'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { STATUS_LABELS, boxPath, plural } from '../ui/format'

const REASONS: Record<string, string> = {
  recorded: 'записана в этой коробке',
  similar_content: 'лежит похожее',
  same_room: 'та же комната',
}

export default function ProgressPage() {
  return <RequireProject>{(pid) => <ProgressView key={pid} pid={pid} />}</RequireProject>
}

function ProgressView({ pid }: { pid: string }) {
  const navigate = useNavigate()
  const progress = useAsync(() => api.progress(pid), [pid], { refreshOnFocus: true })
  const lost = useAsync<LostItem[]>(() => api.lostItems(pid), [pid], { refreshOnFocus: true })
  const { busy, error, run } = useAction()
  const [hints, setHints] = useState<{ name: string; list: Hint[] } | null>(null)

  const reloadAll = () => {
    progress.reload()
    lost.reload()
  }

  const showHints = (entry: LostItem) =>
    run(async () => setHints({ name: entry.item.name, list: await api.hints(pid, entry.item.id) }))

  const p = progress.data
  const lostList = lost.data ?? []

  return (
    <>
    <PageHeading title="Всё доедет до дома.">Контролируйте путь коробок — от скотча до последней распакованной вещи.</PageHeading>
    <StateView loading={progress.loading && !p} error={progress.error} onRetry={reloadAll}>
      {p ? (
        <>
          <ErrorAlert message={error} />
          <JourneySummary pid={pid} progress={p} lost={lostList.length} />

          <div className="stat-grid">
            {BOX_STATUSES.map((s) => (
              <div key={s} className="stat" style={{ borderLeftColor: `var(--st-${s})` }}>
                <b>{p.by_status[s]}</b>
                <span>{STATUS_LABELS[s]}</span>
              </div>
            ))}
          </div>

          <div className="progress-layout">
          <section className="room-progress stack">
          <h2>Готовность по комнатам</h2>
          <span className="eyebrow accent">УПАКОВКА → ПОГРУЗКА → РАСПАКОВКА</span>
          <p className="muted small">Всего {p.boxes_total} {plural(p.boxes_total, ['коробка', 'коробки', 'коробок'])} · распаковано {Math.round(p.unpacked_percent)}%</p>
          {p.boxes_total === 0 ? <p className="muted">Коробок пока нет. Список первого дня можно подготовить уже сейчас.</p> : null}
          {p.rooms.map((r) => (
            <RoomLoadingChecklist key={r.room} pid={pid} room={r} onChanged={reloadAll} />
          ))}

          </section>
          <div className="stack">
          <FirstDayChecklist pid={pid} />
          <aside className="first-day stack">
            <span className="eyebrow accent">ДЕНЬ ПЕРЕЕЗДА</span>
            <h2>Перед закрытием<br />двери</h2>
            <p>Проверьте шкафы и балкон, снимите показания счётчиков, заберите документы и передайте ключи.</p>
            <Link to="/moving-day" className="button dark">Погрузка и приёмка по номерам →</Link>
          </aside>
          </div>
          </div>
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
          <p className="muted small">Потерянную вещь отметьте кнопкой «Не могу найти» в карточке коробки.</p>
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
                  <span className="sub">{REASONS[h.reason] ?? h.reason}</span>
                </span>
                <StatusBadge status={h.status} />
              </button>
            ))}
          </div>
        </Modal>
      ) : null}
    </StateView>
    </>
  )
}
