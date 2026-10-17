import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import Modal from '../components/Modal'
import StatusPickerModal, { type StatusOption } from '../components/StatusPickerModal'
import { BOX_STATUSES, ITEM_STATUSES, type BoxStatus, type Item, type ItemStatus } from '../api/types'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { ITEM_STATUS_HINTS, ITEM_STATUS_LABELS, STATUS_LABELS, canTransition, labelPath, nextStatus, prevStatus } from '../ui/format'

// Варианты статуса коробки: доступны только соседние шаги (правило ТЗ и сервера), остальные объясняем
function boxOptions(current: BoxStatus): StatusOption<BoxStatus>[] {
  const order = BOX_STATUSES.indexOf(current)
  return BOX_STATUSES.map((s) => {
    const allowed = canTransition(current, s)
    const via = BOX_STATUSES.indexOf(s) > order ? nextStatus(current) : prevStatus(current)
    return {
      value: s,
      label: STATUS_LABELS[s],
      badge: `st-${s}`,
      disabled: !allowed,
      hint: allowed ? (s === prevStatus(current) ? 'Вернуть на шаг назад' : 'Следующий шаг') : via ? `Сначала «${STATUS_LABELS[via]}»` : undefined,
    }
  })
}

const itemOptions: StatusOption<ItemStatus>[] = ITEM_STATUSES.map((s) => ({
  value: s,
  label: ITEM_STATUS_LABELS[s],
  hint: ITEM_STATUS_HINTS[s],
  badge: `it-${s}`,
}))

// Карточка коробки. Сюда ведёт QR: /projects/{pid}/boxes/{n} (открытие только читает, дублей не создаёт).
export default function BoxPage() {
  const { pid = '', n = '' } = useParams()
  const number = Number(n)
  const navigate = useNavigate()
  const { projects, currentId, select } = useProjects()
  const valid = pid !== '' && Number.isInteger(number) && number >= 1
  const card = useAsync(() => (valid ? api.getBox(pid, number) : Promise.reject(new Error('Некорректная ссылка на коробку'))), [pid, number])
  const { busy, error, run } = useAction(() => card.reload())
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pickingBox, setPickingBox] = useState(false)
  const [pickingItem, setPickingItem] = useState<Item | null>(null)

  // Открыли коробку по QR из другого проекта: переключаем вкладки на него, чтобы «Коробки» и «План» были про ту же коробку
  useEffect(() => {
    if (valid && pid !== currentId && projects.some((p) => p.id === pid)) select(pid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, projects])

  function deleteBox() {
    if (!window.confirm(`Удалить коробку № ${number} и всё её содержимое?`)) return
    void run(async () => {
      await api.deleteBox(pid, number)
      navigate('/boxes')
    })
  }

  const box = card.data

  return (
    <StateView loading={card.loading && !box} error={card.error} onRetry={card.reload}>
      {box ? (
        <>
          <div className="card stack">
            <div className="row between">
              <div>
                <div className="muted small">Коробка</div>
                <h1 style={{ fontSize: '2.4rem', margin: 0 }}>№ {box.number}</h1>
                <div style={{ fontSize: '1.2rem' }}>{box.room}</div>
              </div>
              <div className="stack" style={{ justifyItems: 'end' }}>
                <StatusBadge status={box.status} />
                {box.fill_later && box.items.length === 0 ? <span className="badge st-packed">Заполнить позже</span> : null}
              </div>
            </div>
            <button className="primary" disabled={busy} onClick={() => setPickingBox(true)}>Сменить статус</button>
            <ErrorAlert message={error} />
            <div className="row wrap">
              <Link to={labelPath(pid, number)} className="button tonal">Этикетка</Link>
              <button className="tonal" onClick={() => setAdding(true)}>+ Вещи</button>
              <button onClick={() => setEditing(true)}>Изменить</button>
            </div>
          </div>

          <SectionTitle>{`Содержимое (${box.items.length})`}</SectionTitle>
          {box.items.length === 0 ? <p className="muted">Пока пусто. Добавьте вещи кнопкой «+ Вещи».</p> : null}
          {box.items.length > 0 ? (
            <div className="card flush">
              {box.items.map((item) => (
                <div key={item.id} className="list-row">
                  <span className="grow">
                    <b>{item.name}</b>
                    {item.lost ? <span className="sub">Ищите в нераспакованных коробках: подсказки на «Прогрессе»</span> : null}
                  </span>
                  <button
                    className={`badge-button badge it-${item.status}`}
                    disabled={busy}
                    aria-label={`Статус «${item.name}»: ${ITEM_STATUS_LABELS[item.status]}. Изменить`}
                    onClick={() => setPickingItem(item)}
                  >
                    {ITEM_STATUS_LABELS[item.status]} ▾
                  </button>
                  <button className="link small" disabled={busy} aria-label={`Удалить «${item.name}»`} onClick={() => window.confirm(`Удалить вещь «${item.name}»?`) && run(() => api.deleteItem(pid, item.id))}>✕</button>
                </div>
              ))}
            </div>
          ) : null}

          <button className="danger" disabled={busy} onClick={deleteBox}>Удалить коробку</button>

          {pickingBox ? (
            <StatusPickerModal
              title={`Статус коробки № ${box.number}`}
              current={box.status}
              options={boxOptions(box.status)}
              onPick={async (to) => { await api.transition(pid, number, to); card.reload() }}
              onClose={() => setPickingBox(false)}
            />
          ) : null}
          {pickingItem ? (
            <StatusPickerModal
              title={`«${pickingItem.name}»`}
              current={pickingItem.status}
              options={itemOptions}
              onPick={async (status) => { await api.updateItem(pid, pickingItem.id, { status }); card.reload() }}
              onClose={() => setPickingItem(null)}
            />
          ) : null}
          {adding ? <AddItemsModal onClose={() => setAdding(false)} onSave={async (text) => { await api.createItemsBulk(pid, number, text); setAdding(false); card.reload() }} /> : null}
          {editing ? (
            <EditBoxModal
              room={box.room}
              fillLater={box.fill_later}
              onClose={() => setEditing(false)}
              onSave={async (room, later) => { await api.updateBox(pid, number, { room, fill_later: later }); setEditing(false); card.reload() }}
            />
          ) : null}
        </>
      ) : null}
    </StateView>
  )
}

function AddItemsModal({ onClose, onSave }: { onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const { busy, error, submit } = useAction()
  return (
    <Modal title="Добавить вещи" onClose={onClose} dirty={text.trim() !== ''}>
      <form className="stack" onSubmit={submit(() => onSave(text))}>
        <label>
          Каждая вещь с новой строки
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} data-autofocus />
        </label>
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !text.trim()}>Добавить</button>
      </form>
    </Modal>
  )
}

function EditBoxModal({ room: initialRoom, fillLater, onClose, onSave }: { room: string; fillLater: boolean; onClose: () => void; onSave: (room: string, later: boolean) => Promise<void> }) {
  const [room, setRoom] = useState(initialRoom)
  const [later, setLater] = useState(fillLater)
  const { busy, error, submit } = useAction()
  return (
    <Modal title="Изменить коробку" onClose={onClose}>
      <form className="stack" onSubmit={submit(() => onSave(room.trim(), later))}>
        <label>
          Комната назначения
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} data-autofocus />
        </label>
        <label className="row">
          <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
          Заполнить позже
        </label>
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !room.trim()}>Сохранить</button>
      </form>
    </Modal>
  )
}
