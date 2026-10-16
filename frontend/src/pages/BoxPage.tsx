import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import Modal from '../components/Modal'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { STATUS_LABELS, boxPath, nextStatus, prevStatus } from '../ui/format'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'

// Карточка коробки. Сюда ведёт QR: /projects/{pid}/boxes/{n} (открытие только читает, дублей не создаёт).
export default function BoxPage() {
  const { pid = '', n = '' } = useParams()
  const number = Number(n)
  const navigate = useNavigate()
  const { projects, add } = useProjects()
  const valid = pid !== '' && Number.isInteger(number) && number >= 1
  const card = useAsync(() => (valid ? api.getBox(pid, number) : Promise.reject(new Error('Некорректная ссылка на коробку'))), [pid, number])
  const { busy, error, run } = useAction(() => card.reload())
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  // Открыли ссылку из QR на чужом устройстве: запоминаем проект, чтобы вкладки работали с ним
  useEffect(() => {
    if (valid && !projects.some((p) => p.id === pid)) {
      api.getProject(pid).then((p) => add({ id: p.id, name: p.name })).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid])

  function deleteBox() {
    if (!window.confirm(`Удалить коробку № ${number} и всё её содержимое?`)) return
    void run(async () => {
      await api.deleteBox(pid, number)
      navigate('/boxes')
    })
  }

  const box = card.data
  const next = box ? nextStatus(box.status) : null
  const prev = box ? prevStatus(box.status) : null

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
            <div className="row wrap">
              {prev ? <button disabled={busy} onClick={() => run(() => api.transition(pid, number, prev))}>↩ {STATUS_LABELS[prev]}</button> : null}
              {next ? <button className="primary" disabled={busy} onClick={() => run(() => api.transition(pid, number, next))}>{STATUS_LABELS[next]} →</button> : null}
            </div>
            {error ? <div className="alert" role="alert">{error}</div> : null}
            <div className="row wrap">
              <Link to={`${boxPath(pid, number)}/label`}><button className="tonal">Этикетка</button></Link>
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
                    {item.lost ? <span className="sub">Потеряна: ищите в нераспакованных коробках</span> : null}
                  </span>
                  <button className="small" disabled={busy} onClick={() => run(() => api.updateItem(pid, item.id, { lost: !item.lost }))}>
                    {item.lost ? 'Нашлась' : 'Потеряна'}
                  </button>
                  <button className="link small" disabled={busy} aria-label={`Удалить «${item.name}»`} onClick={() => window.confirm(`Удалить вещь «${item.name}»?`) && run(() => api.deleteItem(pid, item.id))}>✕</button>
                </div>
              ))}
            </div>
          ) : null}

          <button className="danger" disabled={busy} onClick={deleteBox}>Удалить коробку</button>

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

// Отправка формы в модалке: блокирует кнопку, показывает ошибку сервера, при успехе модалка закрывает себя сама
function useSubmit(save: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await save()
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function AddItemsModal({ onClose, onSave }: { onClose: () => void; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState('')
  const { busy, error, submit } = useSubmit(() => onSave(text))
  return (
    <Modal title="Добавить вещи" onClose={onClose} dirty={text.trim() !== ''}>
      <form className="stack" onSubmit={submit}>
        <label>
          Каждая вещь с новой строки
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} data-autofocus />
        </label>
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || !text.trim()}>Добавить</button>
      </form>
    </Modal>
  )
}

function EditBoxModal({ room: initialRoom, fillLater, onClose, onSave }: { room: string; fillLater: boolean; onClose: () => void; onSave: (room: string, later: boolean) => Promise<void> }) {
  const [room, setRoom] = useState(initialRoom)
  const [later, setLater] = useState(fillLater)
  const { busy, error, submit } = useSubmit(() => onSave(room.trim(), later))
  return (
    <Modal title="Изменить коробку" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>
          Комната назначения
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} data-autofocus />
        </label>
        <label className="row">
          <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
          Заполнить позже
        </label>
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || !room.trim()}>Сохранить</button>
      </form>
    </Modal>
  )
}
