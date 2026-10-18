import { useState } from 'react'
import { FIRST_DAY_BASICS, firstDayLines } from '../features/planner/firstDayDefaults'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import { moveDateBounds, moveDatesError } from '../ui/format'
import AddressInput from './AddressInput'
import PersonalPlanner from '../features/planner/PersonalPlanner'
import type { PersonalPlan } from '../features/planner/types'

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new. */
export default function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [withAddresses, setWithAddresses] = useState(false)
  const [plan, setPlan] = useState<PersonalPlan | null>(null)
  const [planMode, setPlanMode] = useState<'standard' | 'empty'>('standard')
  const [firstDay, setFirstDay] = useState(FIRST_DAY_BASICS.join('\n'))
  const [generating, setGenerating] = useState(false)
  const { busy, error, submit } = useAction()

  const datesError = moveDatesError(date, dateEnd)
  const bounds = moveDateBounds()
  const invalid = name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || datesError !== null

  const create = async () => {
    if (planMode === 'standard' && (firstDayLines(firstDay).length > 20 || firstDayLines(firstDay).some(t => t.length > 200))) throw new Error('Первый день: до 20 пунктов, каждый не длиннее 200 символов.')
    const project = await api.createProject({ name: name.trim(), move_date: date,
      ...(dateEnd ? { move_date_end: dateEnd } : {}),
      ...(from.trim() ? { address_from: from.trim() } : {}),
      ...(to.trim() ? { address_to: to.trim() } : {}),
      plan_mode: planMode,
      ...(planMode === 'standard' ? { first_day: firstDayLines(firstDay), ...(plan ? { personal_plan: plan } : {}) } : {}),
    })
    add({ id: project.id, name: project.name, role: 'owner', move_date: project.move_date, ...(project.move_date_end ? { move_date_end: project.move_date_end } : {}) })
    onDone?.()
  }

  return (
    <form className="card stack narrow" onSubmit={submit(create)}>
      <h2>Новый переезд</h2>
      <p className="muted">Сразу подготовим стандартные задачи со сроками и список первого дня. Вы также можете выбрать пустой план.</p>
      <Link to="/calculator" className="small">Сначала прикинуть бюджет, коробки и сроки → калькулятор</Link>
      <label>
        Название переезда
        <input value={name} disabled={busy || generating} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Переезд на Лесную" data-autofocus />
      </label>
      <div className="form-grid">
        <label>
          Дата переезда
          <input type="date" value={date} min={bounds.min} max={bounds.max} disabled={busy || generating}
            onChange={(e) => { setDate(e.target.value); setPlan(null) }} />
        </label>
        <label>
          По (если переезд на несколько дней)
          <input type="date" value={dateEnd} min={date || undefined} disabled={busy || generating}
            onChange={(e) => setDateEnd(e.target.value)} aria-describedby="move-dates-hint" />
        </label>
      </div>
      {datesError ? <p className="error small" id="move-dates-hint" role="alert">{datesError}</p> : null}
      {withAddresses ? <div className="form-grid">
        <AddressInput label="Откуда (необязательно)" value={from} onChange={setFrom} />
        <AddressInput label="Куда (необязательно)" value={to} onChange={setTo} />
      </div> : <button type="button" className="link small" onClick={() => setWithAddresses(true)}>Добавить адреса (необязательно)</button>}
      <label>Начальный план<select value={planMode} disabled={busy || generating} onChange={e => { setPlanMode(e.target.value as 'standard' | 'empty'); setPlan(null) }}>
        <option value="standard">Стандартный план и список первого дня</option>
        <option value="empty">Пустой план — составлю самостоятельно</option>
      </select></label>
      {planMode === 'standard' ? <>
        <label>Первый день: что подготовить<textarea rows={4} value={firstDay} disabled={busy || generating} onChange={e => setFirstDay(e.target.value)} maxLength={4020} /></label>
        <p className="muted small">По одному пункту на строку. Список сохранится без коробок; привязать вещи к ним можно позже.</p>
      <PersonalPlanner moveDate={datesError ? '' : date} plan={plan} onPlan={setPlan} busy={busy || generating} onBusy={setGenerating} />
      </> : <p className="muted small">Без готовых задач и списка первого дня. Добавите их, когда будет удобно.</p>}
      <ErrorAlert message={error} />
      <button className="primary" type="submit" disabled={busy || generating || invalid}>Создать проект</button>
    </form>
  )
}
