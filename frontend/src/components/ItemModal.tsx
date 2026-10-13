import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, isAbort } from '../api'
import {
  ACTION_LABEL,
  COMMENT_REQUIRED,
  EVENT_LABEL,
  STATUS_LABEL,
  availableActions,
  formatDate,
  formatMoney,
} from '../labels'
import type { Action, Item, ItemEvent, User } from '../types'
import ItemForm from './ItemForm'
import Modal from './Modal'
import StatusBadge from './StatusBadge'

interface Props {
  itemId: number
  user: User
  onClose: () => void
  onChanged: () => void
}

export default function ItemModal({ itemId, user, onClose, onChanged }: Props) {
  const [item, setItem] = useState<Item | null>(null)
  const [loadError, setLoadError] = useState('')
  const [events, setEvents] = useState<ItemEvent[]>([])
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Запись грузится по id: так окно открывается и по прямой ссылке (#/items/12), и после F5
  useEffect(() => {
    const ctrl = new AbortController()
    api
      .getItem(itemId, ctrl.signal)
      .then(setItem)
      .catch((e) => {
        if (!isAbort(e)) setLoadError(e instanceof ApiError ? e.message : 'Не удалось загрузить запись')
      })
    api
      .events(itemId, ctrl.signal)
      .then(setEvents)
      .catch(() => {})
    return () => ctrl.abort()
  }, [itemId])

  const refresh = useCallback(async () => {
    const [fresh, history] = await Promise.all([api.getItem(itemId), api.events(itemId)])
    setItem(fresh)
    setEvents(history)
    onChanged()
  }, [itemId, onChanged])

  const run = async (action: Action) => {
    if (!item) return
    setError('')
    if (COMMENT_REQUIRED.includes(action) && !comment.trim()) {
      setError('Для этого действия нужен комментарий')
      return
    }
    setBusy(true)
    try {
      await api.transition(item.id, action, comment.trim() || undefined)
      setComment('')
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие')
      // 403/409: запись уже изменили (другой администратор, другая вкладка). Перечитываем,
      // чтобы кнопки соответствовали реальному статусу, а не устаревшему.
      if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
        await refresh().catch(() => {})
      }
    } finally {
      setBusy(false)
    }
  }

  if (loadError)
    return (
      <Modal title="Запись" onClose={onClose}>
        <div className="alert" role="alert">
          {loadError}
        </div>
      </Modal>
    )
  if (!item)
    return (
      <Modal title="Запись" onClose={onClose}>
        <p className="muted">Загрузка…</p>
      </Modal>
    )

  const isOwner = item.owner_id === user.id
  const actions = availableActions(item.status, isOwner, user.role === 'admin')
  const canEdit = isOwner && (item.status === 'draft' || item.status === 'changes_requested')

  return (
    <Modal title={editing ? 'Редактирование' : item.title} onClose={onClose} dirty={editing && dirty}>
      {editing ? (
        <ItemForm
          item={item}
          onDirtyChange={setDirty}
          onCancel={() => setEditing(false)}
          onSaved={async (saved) => {
            setItem(saved)
            setEditing(false)
            await refresh().catch(() => {})
          }}
        />
      ) : (
        <>
          <div className="row wrap">
            <StatusBadge status={item.status} />
            <span className="muted">{formatMoney(item.amount)}</span>
            <span className="muted">Автор: {item.owner_name}</span>
          </div>
          <p className="description">{item.description || 'Описание не заполнено'}</p>

          {actions.length > 0 && (
            <div className="stack">
              {actions.some((a) => COMMENT_REQUIRED.includes(a)) && (
                <label>
                  Комментарий
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Обязателен при отклонении и возврате на доработку"
                  />
                </label>
              )}
              <div className="row wrap">
                {actions.map((a) => (
                  <button
                    key={a}
                    disabled={busy}
                    className={a === 'approve' || a === 'submit' ? 'primary' : a === 'reject' ? 'danger' : ''}
                    onClick={() => run(a)}
                  >
                    {ACTION_LABEL[a]}
                  </button>
                ))}
                {canEdit && <button onClick={() => setEditing(true)}>Редактировать</button>}
              </div>
            </div>
          )}
          {actions.length === 0 && canEdit && (
            <button onClick={() => setEditing(true)}>Редактировать</button>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}

          <h3>История</h3>
          <ul className="timeline">
            {events.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{EVENT_LABEL[e.action] ?? e.action}</strong>
                  {e.action !== 'update' && <> → {STATUS_LABEL[e.to_status]}</>}
                </div>
                <div className="muted small">
                  {e.actor_name} · {formatDate(e.created_at)}
                </div>
                {e.comment && <div className="quote">{e.comment}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}
