import { type FormEvent, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { Item } from '../types'

interface Props {
  item?: Item
  onSaved: (item: Item) => void
  onCancel: () => void
  /** Сообщает родителю, есть ли несохранённые правки (окно спросит перед закрытием) */
  onDirtyChange?: (dirty: boolean) => void
}

// Те же границы, что в backend/app/schemas.py: клиентская проверка не должна быть строже или мягче сервера
const LIMITS = { titleMin: 3, titleMax: 120, descMax: 2000, amountMax: 1_000_000_000 }

export default function ItemForm({ item, onSaved, onCancel, onDirtyChange }: Props) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [amount, setAmount] = useState(String(item?.amount ?? ''))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const dirty =
    title !== (item?.title ?? '') ||
    description !== (item?.description ?? '') ||
    amount !== String(item?.amount ?? '')
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e: Record<string, string> = {}
    if (title.trim().length < LIMITS.titleMin) e.title = `Минимум ${LIMITS.titleMin} символа`
    if (!/^\d+$/.test(amount) || Number(amount) > LIMITS.amountMax)
      e.amount = 'Целое число от 0 до 1 000 000 000'
    setErrors(e)
    setFormError('')
    if (Object.keys(e).length) return

    setBusy(true)
    const data = { title: title.trim(), description, amount: Number(amount) }
    try {
      const saved = item ? await api.updateItem(item.id, data) : await api.createItem(data)
      onDirtyChange?.(false)
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])))
      } else setFormError('Не удалось сохранить. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack">
      <label>
        Название
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.titleMax}
          autoFocus
          data-autofocus
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'err-title' : undefined}
        />
        {errors.title && (
          <span className="error" id="err-title">
            {errors.title}
          </span>
        )}
      </label>
      <label>
        Описание
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={LIMITS.descMax}
        />
      </label>
      <label>
        Сумма, ₽
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? 'err-amount' : undefined}
        />
        {errors.amount && (
          <span className="error" id="err-amount">
            {errors.amount}
          </span>
        )}
      </label>
      {formError && (
        <div className="alert" role="alert">
          {formError}
        </div>
      )}
      <div className="row">
        <button className="primary" disabled={busy}>
          {busy ? 'Сохраняем…' : item ? 'Сохранить' : 'Создать'}
        </button>
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  )
}
