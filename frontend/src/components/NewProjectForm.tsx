import { useState } from 'react'
import { api } from '../api/endpoints'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new. */
export default function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const { busy, error, submit } = useAction()

  const invalid = name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)

  const create = async () => {
    const project = await api.createProject({ name: name.trim(), move_date: date })
    add({ id: project.id, name: project.name, role: 'owner' })
    onDone?.()
  }

  return (
    <form className="card stack narrow" onSubmit={submit(create)}>
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
      <ErrorAlert message={error} />
      <button className="primary" type="submit" disabled={busy || invalid}>Создать проект</button>
    </form>
  )
}
