import { useState } from 'react'
import { api } from '../api/endpoints'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import AddressInput from './AddressInput'
import PersonalPlanner from '../features/planner/PersonalPlanner'
import type { PersonalPlan } from '../features/planner/types'

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new. */
export default function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [withAddresses, setWithAddresses] = useState(false)
  const [plan, setPlan] = useState<PersonalPlan | null>(null)
  const [generating, setGenerating] = useState(false)
  const { busy, error, submit } = useAction()

  const invalid = name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)

  const create = async () => {
    const project = await api.createProject({ name: name.trim(), move_date: date,
      ...(from.trim() ? { address_from: from.trim() } : {}),
      ...(to.trim() ? { address_to: to.trim() } : {}),
      ...(plan ? { personal_plan: plan } : {}),
    })
    add({ id: project.id, name: project.name, role: 'owner' })
    onDone?.()
  }

  return (
    <form className="card stack narrow" onSubmit={submit(create)}>
      <h2>Новый переезд</h2>
      <p className="muted">Создайте проект и добавьте задачи или получите персональный AI-план.</p>
      <label>
        Название переезда
        <input value={name} disabled={busy || generating} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Переезд на Лесную" data-autofocus />
      </label>
      <label>
        Дата переезда
        <input type="date" value={date} min="1900-01-01" max="9998-12-31" disabled={busy || generating}
          onChange={(e) => { setDate(e.target.value); setPlan(null) }} />
      </label>
      {withAddresses ? <div className="form-grid">
        <AddressInput label="Откуда (необязательно)" value={from} onChange={setFrom} />
        <AddressInput label="Куда (необязательно)" value={to} onChange={setTo} />
      </div> : <button type="button" className="link small" onClick={() => setWithAddresses(true)}>Добавить адреса (необязательно)</button>}
      <PersonalPlanner moveDate={date} plan={plan} onPlan={setPlan} busy={busy || generating} onBusy={setGenerating} />
      <ErrorAlert message={error} />
      <button className="primary" type="submit" disabled={busy || generating || invalid}>Создать проект</button>
    </form>
  )
}
