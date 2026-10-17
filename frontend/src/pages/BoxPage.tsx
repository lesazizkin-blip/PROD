import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { ITEM_STATUSES, type BoxStatus, type Item, type ItemStatus } from '../api/types'
import { api } from '../api/endpoints'
import Modal from '../components/Modal'
import StatusPickerModal, { type StatusOption } from '../components/StatusPickerModal'
import { boxStatusOptions } from '../components/statusOptions'
import { useConfirm } from '../state/confirm'
import BoxVolume from '../components/BoxVolume'
import PageHeading from '../components/PageHeading'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { roomStyle } from '../ui/roomTheme'
import { ITEM_STATUS_HINTS, ITEM_STATUS_LABELS, STATUS_LABELS, labelPath, plural } from '../ui/format'

// Варианты статуса коробки: любой, шаги можно пропускать и возвращаться
const boxOptions = boxStatusOptions()

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
  const card = useAsync(() => (valid ? api.getBox(pid, number) : Promise.reject(new Error('Некорректная ссылка на коробку'))), [pid, number], { refreshOnFocus: true })
  const { busy: actionBusy, error, run } = useAction(() => card.reload())
  const [packingAnimation, setPackingAnimation] = useState(false)
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeKey = useRef(`${pid}/${number}`)
  const busy = actionBusy || packingAnimation
  useEffect(() => {
    routeKey.current = `${pid}/${number}`
    setPackingAnimation(false)
    return () => {
      routeKey.current = ''
      if (animationTimer.current) clearTimeout(animationTimer.current)
    }
  }, [pid, number])

  // Любой статус выбирается в окне; при «Собрана» коробка заклеивается (только после подтверждённого сохранения)
  async function changeStatus(to: BoxStatus) {
    const key = `${pid}/${number}`
    await api.transition(pid, number, to)
    card.reload()
    if (to === 'packed' && routeKey.current === key && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPackingAnimation(true)
      animationTimer.current = setTimeout(() => setPackingAnimation(false), 1600)
    }
  }
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pickingBox, setPickingBox] = useState(false)
  const [pickingItem, setPickingItem] = useState<Item | null>(null)

  // Открыли коробку по QR из другого проекта: переключаем вкладки на него, чтобы «Коробки» и «План» были про ту же коробку
  useEffect(() => {
    if (valid && pid !== currentId && projects.some((p) => p.id === pid)) select(pid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, projects])

  async function deleteBox() {
    if (!(await confirm({ title: `Удалить коробку № ${number}?`, message: 'Вместе с ней удалятся все вещи внутри. Это нельзя отменить.' }))) return
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
          <PageHeading title={`Коробка ${String(box.number).padStart(3, '0')}`}>{box.room} · {box.items.length} {plural(box.items.length, ['вещь', 'вещи', 'вещей'])} · {STATUS_LABELS[box.status]}</PageHeading>
          <div className="box-detail-layout">
          <aside className="box-summary stack" style={roomStyle(box.room)}>
            <div className="row between">
              <div>
                <div className="muted small">Коробка</div>
                <div className="box-summary-identity"><div className="detail-number">{String(box.number).padStart(3, '0')}</div><BoxVolume status={box.status} closing={packingAnimation} /></div>
                <div className="summary-room">{box.room}</div>
              </div>
              <div className="stack" style={{ justifyItems: 'end' }}>
                <StatusBadge status={box.status} />
                {box.fill_later && box.items.length === 0 ? <span className="badge st-packed">Заполнить позже</span> : null}
              </div>
            </div>
            <button className="primary" disabled={busy} onClick={() => setPickingBox(true)}>{packingAnimation ? 'Заклеиваем…' : 'Сменить статус'}</button>
            <ErrorAlert message={error} />
            <details className="stack">
              <summary>Нет принтера?</summary>
              <p>Напишите маркером на коробке <strong>#{String(box.number).padStart(3, '0')}</strong> и комнату «{box.room}». Лучше подписать с двух сторон.</p>
              <p>Открыть коробку можно по номеру в выбранном проекте.</p>
              <Link to="/scan" className="button tonal">Найти по номеру</Link>
            </details>
            <div className="row wrap">
              <Link to={labelPath(pid, number)} className="button tonal">Этикетка</Link>
              <button className="tonal" onClick={() => setAdding(true)}>+ Вещи</button>
              <button onClick={() => setEditing(true)}>Изменить</button>
            </div>
            <p className="paper-note">Подпишите коробку с двух сторон — так её проще найти в стопке.</p>
          </aside>
          <section className="box-contents stack">
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
                    className={item.first_day ? 'chip-toggle on' : 'chip-toggle'}
                    aria-pressed={item.first_day}
                    disabled={busy}
                    title="Понадобится в первый день на новом месте"
                    onClick={() => run(() => api.updateItem(pid, item.id, { first_day: !item.first_day }))}
                  >
                    {item.first_day ? '✓ ' : ''}Первый день
                  </button>
                  <button
                    className={`badge-button badge it-${item.status}`}
                    disabled={busy}
                    aria-label={`Статус «${item.name}»: ${ITEM_STATUS_LABELS[item.status]}. Изменить`}
                    onClick={() => setPickingItem(item)}
                  >
                    {ITEM_STATUS_LABELS[item.status]} ▾
                  </button>
                  <button className="link small" disabled={busy} aria-label={`Удалить «${item.name}»`} onClick={async () => { if (await confirm({ title: `Удалить «${item.name}»?`, message: 'Вещь пропадёт из коробки и из поиска.' })) void run(() => api.deleteItem(pid, item.id)) }}><Trash2 className="icon-sm" aria-hidden /></button>
                </div>
              ))}
              <button className="list-row add-row" onClick={() => setAdding(true)}><Plus className="icon-sm" aria-hidden />Добавить вещи</button>
            </div>
          ) : null}

          <button className="danger" disabled={busy} onClick={deleteBox}>Удалить коробку</button>
          </section>
          </div>
          <Link to="/boxes" className="button back-link">← К коробкам</Link>

          {pickingBox ? (
            <StatusPickerModal
              title={`Статус коробки № ${box.number}`}
              current={box.status}
              options={boxOptions}
              onPick={changeStatus}
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
