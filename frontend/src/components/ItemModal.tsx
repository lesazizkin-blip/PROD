import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
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
import StatusBadge from './StatusBadge'

interface Props {
  item: Item
  user: User
  onClose: () => void
  onChanged: () => void
}

export default function ItemModal({ item: initial, user, onClose, onChanged }: Props) {
  const [item, setItem] = useState(initial)
  const [events, setEvents] = useState<ItemEvent[]>([])
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadEvents = useCallback(() => api.events(item.id).then(setEvents).catch(() => {}), [item.id])
  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isOwner = item.owner_id === user.id
  const actions = availableActions(item.status, isOwner, user.role === 'admin')
  const canEdit = isOwner && (item.status === 'draft' || item.status === 'changes_requested')

  const run = async (action: Action) => {
    setError('')
    if (COMMENT_REQUIRED.includes(action) && !comment.trim()) {
      setError('Для этого действия нужен комментарий')
      return
    }
    setBusy(true)
    try {
      const updated = await api.transition(item.id, action, comment.trim() || undefined)
      setItem(updated)
      setComment('')
      await loadEvents()
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        {editing ? (
          <>
            <h2>Редактирование</h2>
            <ItemForm
              item={item}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                api.events(item.id).then(setEvents)
                onChanged()
                onClose()
              }}
            />
          </>
        ) : (
          <>
            <h2>{item.title}</h2>
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
            {actions.length === 0 && canEdit && <button onClick={() => setEditing(true)}>Редактировать</button>}
            {error && <div className="alert">{error}</div>}

            <h3>История</h3>
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{EVENT_LABEL[e.action] ?? e.action}</strong> → {STATUS_LABEL[e.to_status]}
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
      </div>
    </div>
  )
}
