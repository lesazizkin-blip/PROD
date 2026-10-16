import { useState, type FormEvent } from 'react'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import { useProjects } from '../state/ProjectContext'

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new. */
export default function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalid = name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)

  async function run(action: () => Promise<{ id: string; name: string }>) {
    setBusy(true)
    setError(null)
    try {
      const project = await action()
      add({ id: project.id, name: project.name, role: 'owner' })
      onDone?.()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!invalid) void run(() => api.createProject({ name: name.trim(), move_date: date }))
  }

  return (
    <form className="card stack narrow" onSubmit={submit}>
      <h2>Новый переезд</h2>
      <p className="muted">Создайте проект: после этого появится готовый план задач.</p>
      <label>
        Название
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Переезд на Лесную" data-autofocus />
      </label>
      <label>
        Дата переезда
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <button className="primary" type="submit" disabled={busy || invalid}>Создать проект</button>
    </form>
  )
}
