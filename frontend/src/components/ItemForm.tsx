import { type FormEvent, useState } from 'react'
import { ApiError, api } from '../api'
import type { Item } from '../types'

interface Props {
  item?: Item
  onSaved: () => void
  onCancel: () => void
}

export default function ItemForm({ item, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [amount, setAmount] = useState(String(item?.amount ?? ''))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const e: Record<string, string> = {}
    if (title.trim().length < 3) e.title = 'Минимум 3 символа'
    if (!/^\d+$/.test(amount)) e.amount = 'Целое число не меньше 0'
    setErrors(e)
    setFormError('')
    if (Object.keys(e).length) return

    setBusy(true)
    const data = { title: title.trim(), description, amount: Number(amount) }
    try {
      if (item) await api.updateItem(item.id, data)
      else await api.createItem(data)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message)
        setErrors(Object.fromEntries(err.fields.map((f) => [f.field, f.message])))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="stack">
      <label>
        Название
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        {errors.title && <span className="error">{errors.title}</span>}
      </label>
      <label>
        Описание
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} />
      </label>
      <label>
        Сумма, ₽
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        {errors.amount && <span className="error">{errors.amount}</span>}
      </label>
      {formError && <div className="alert">{formError}</div>}
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
