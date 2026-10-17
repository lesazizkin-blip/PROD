import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { api } from '../api/endpoints'
import type { Hint, LostItem } from '../api/types'
import { BOX_STATUSES } from '../api/types'
import Modal from '../components/Modal'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import ProgressBar from '../ui/ProgressBar'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { STATUS_LABELS, boxPath } from '../ui/format'

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
    <StateView loading={progress.loading && !p} error={progress.error} empty={!!p && p.boxes_total === 0} emptyText="Коробок пока нет: прогресс появится после первой коробки" emptyIcon="📊" onRetry={reloadAll}>
      {p ? (
        <>
          <ErrorAlert message={error} />

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
          <p className="muted small">Всего {p.boxes_total} коробок · распаковано {Math.round(p.unpacked_percent)}%</p>
          {p.rooms.map((r) => (
            <div key={r.room} className="card stack">
              <b>{r.room} · {r.total} кор.</b>
              <div className="small muted">Погружено {r.loaded} из {r.total}</div>
              <ProgressBar value={r.loaded_percent} label={`${r.room}: погружено`} color="var(--st-loaded)" />
              <div className="small muted">Распаковано {r.unpacked} из {r.total}</div>
              <ProgressBar value={r.unpacked_percent} label={`${r.room}: распаковано`} color="var(--st-unpacked)" />
            </div>
          ))}

          </section>
          <div className="stack">
          <FirstDayWidget pid={pid} />
          <aside className="first-day stack">
            <span className="eyebrow accent">ДЕНЬ ПЕРЕЕЗДА</span>
            <h2>Перед закрытием<br />двери</h2>
            <p>Проверьте шкафы и балкон, снимите показания счётчиков, заберите документы и передайте ключи.</p>
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

/** Чек-лист по распаковке вещей первого дня (раздел 5.4 ТЗ): вещи с пометкой «Первый день»;
 *  галочка = вещь распакована (статус вещи «Распакована»), снятая галочка возвращает «Упакована». */
function FirstDayWidget({ pid }: { pid: string }) {
  const items = useAsync(() => api.firstDayItems(pid), [pid], { refreshOnFocus: true })
  const [error, setError] = useState<string | null>(null)
  const list = items.data ?? []
  const done = list.filter((x) => x.item.status === 'unpacked').length
  if (!items.data) return null
  const toggle = (id: number, unpacked: boolean) => {
    const status = unpacked ? 'unpacked' : 'packed'
    setError(null)
    items.mutate((xs) => xs?.map((x) => (x.item.id === id ? { ...x, item: { ...x.item, status } } : x)) ?? xs)
    api.updateItem(pid, id, { status }).catch((e) => {
      setError(errorMessage(e))
      items.reload()
    })
  }
  return (
    <section className="first-day stack">
      <span className="eyebrow accent">ОТКРЫТЬ ПЕРВОЙ</span>
      <h2>Чек-лист по распаковке вещей первого дня</h2>
      <span className="muted small">Распаковано {done} из {list.length}</span>
      {list.length === 0 ? (
        <p className="muted small">Пока пусто: отметьте «Первый день» у нужных вещей в карточке коробки или добавьте их на вкладке «Первый день» в «Плане».</p>
      ) : (
        <>
          <ProgressBar value={done} max={list.length} label="Распаковано вещей первого дня" />
          <ul className="plain first-day__list">
            {list.map((x) => (
              <li key={x.item.id} className={x.item.status === 'unpacked' ? 'done' : ''}>
                <label className="row">
                  <input type="checkbox" className="check" checked={x.item.status === 'unpacked'} onChange={() => toggle(x.item.id, x.item.status !== 'unpacked')} />
                  {x.item.name} <span className="muted small">· № {x.box_number}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <ErrorAlert message={error} />
    </section>
  )
}
