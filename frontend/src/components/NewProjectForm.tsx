import { useRef, useState, type FocusEvent, type FormEvent } from 'react'
import { FIRST_DAY_BASICS, firstDayLines } from '../features/planner/firstDayDefaults'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import FieldError from '../ui/FieldError'
import { isBadDateInput, serverFieldErrors } from '../ui/fieldErrors'
import { moveDateBounds, moveDatesError } from '../ui/format'
import AddressInput from './AddressInput'
import PersonalPlanner from '../features/planner/PersonalPlanner'
import type { PersonalPlan } from '../features/planner/types'

type Field = 'name' | 'move_date' | 'move_date_end' | 'first_day'
const FIELDS: readonly Field[] = ['name', 'move_date', 'move_date_end', 'first_day']

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new.
 *  Кнопка «Создать проект» доступна всегда: если что-то не так, под нужным полем появляется,
 *  что исправить, поле подсвечивается и получает фокус. */
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
  // поле уже покидали (или форму пытались отправить): только тогда ругаемся на пустое
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  // дата набрана, но её нет в календаре: значение поля при этом пустое
  const [badDate, setBadDate] = useState({ start: false, end: false })
  const [serverFields, setServerFields] = useState<Partial<Record<Field, string>>>({})
  const { busy, error, setError, submit } = useAction()
  const nameRef = useRef<HTMLInputElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const firstDayRef = useRef<HTMLTextAreaElement>(null)
  // только для обработчиков событий: фокус на первое неверное поле
  const fieldEl = (f: Field) => ({ name: nameRef, move_date: startRef, move_date_end: endRef, first_day: firstDayRef })[f].current

  const bounds = moveDateBounds()
  const startError = moveDatesError(date, '')
  const lines = firstDayLines(firstDay)
  const errors: Partial<Record<Field, string>> = { ...serverFields }
  if (touched.name && !name.trim()) errors.name = 'Введите название переезда'
  if (badDate.start) errors.move_date = 'Такой даты нет в календаре: проверьте число и месяц'
  else if (startError) errors.move_date = startError
  else if (touched.move_date && !date) errors.move_date = 'Выберите дату переезда'
  if (badDate.end) errors.move_date_end = 'Дата окончания: такой даты нет в календаре'
  else if (date && !startError && dateEnd) {
    const endError = moveDatesError(date, dateEnd)
    if (endError) errors.move_date_end = endError
  }
  if (planMode === 'standard' && lines.length > 20) errors.first_day = `Первый день: не больше 20 пунктов (сейчас ${lines.length})`
  else if (planMode === 'standard' && lines.some((t) => t.length > 200)) errors.first_day = 'Первый день: каждый пункт не длиннее 200 символов'
  // общая плашка не повторяет текст, который уже стоит под полем
  const alert = error && !Object.values(errors).includes(error) ? error : null

  const clearServer = (field: Field) => {
    if (field in serverFields) {
      setServerFields((prev) => {
        const rest = { ...prev }
        delete rest[field]
        return rest
      })
    }
    if (error) setError(null)
  }
  const touch = (field: Field) => () => setTouched((t) => (t[field] ? t : { ...t, [field]: true }))
  const checkDate = (key: 'start' | 'end', field: Field) => (e: FocusEvent<HTMLInputElement>) => {
    const bad = isBadDateInput(e.currentTarget)
    setBadDate((b) => (b[key] === bad ? b : { ...b, [key]: bad }))
    touch(field)()
  }
  const invalidProps = (field: Field) => ({
    'aria-invalid': field in errors,
    'aria-describedby': field in errors ? `new-project-${field}-error` : undefined,
  })

  const create = async () => {
    try {
      const project = await api.createProject({ name: name.trim(), move_date: date,
        ...(dateEnd ? { move_date_end: dateEnd } : {}),
        ...(from.trim() ? { address_from: from.trim() } : {}),
        ...(to.trim() ? { address_to: to.trim() } : {}),
        plan_mode: planMode,
        ...(planMode === 'standard' ? { first_day: lines, ...(plan ? { personal_plan: plan } : {}) } : {}),
      })
      add({ id: project.id, name: project.name, role: 'owner', move_date: project.move_date, ...(project.move_date_end ? { move_date_end: project.move_date_end } : {}) })
      onDone?.()
    } catch (e) {
      setServerFields(serverFieldErrors(e, FIELDS))
      throw e
    }
  }

  const onSubmit = (e: FormEvent) => {
    // проверка до отправки: что не так - видно под полем, фокус - на первом таком поле
    const bad = { start: isBadDateInput(startRef.current), end: isBadDateInput(endRef.current) }
    setBadDate(bad)
    setTouched({ name: true, move_date: true, move_date_end: true, first_day: true })
    const wrong: Field[] = []
    if (!name.trim()) wrong.push('name')
    if (bad.start || !date || startError) wrong.push('move_date')
    if (bad.end || 'move_date_end' in errors) wrong.push('move_date_end')
    if ('first_day' in errors) wrong.push('first_day')
    if (wrong.length) {
      e.preventDefault()
      fieldEl(FIELDS.find((f) => wrong.includes(f)) ?? 'name')?.focus()
      return
    }
    submit(create)(e)
  }

  const locked = busy || generating
  return (
    <form className="card stack narrow" onSubmit={onSubmit} noValidate>
      <h2>Новый переезд</h2>
      <p className="muted">Сразу подготовим стандартные задачи со сроками и список первого дня. Вы также можете выбрать пустой план.</p>
      <Link to="/calculator" className="small">Сначала прикинуть бюджет, коробки и сроки → калькулятор</Link>
      <label>
        Название переезда
        <input ref={nameRef} value={name} disabled={locked} onChange={(e) => { setName(e.target.value); clearServer('name') }} onBlur={touch('name')}
          maxLength={120} placeholder="Переезд на Лесную" data-autofocus {...invalidProps('name')} />
      </label>
      <FieldError id="new-project-name-error" message={errors.name} />
      <div className="form-grid">
        <div className="stack">
          <label>
            Дата переезда
            <input ref={startRef} type="date" value={date} min={bounds.min} max={bounds.max} disabled={locked}
              onChange={(e) => { setDate(e.target.value); setPlan(null); setBadDate((b) => ({ ...b, start: false })); clearServer('move_date') }}
              onBlur={checkDate('start', 'move_date')} {...invalidProps('move_date')} />
          </label>
          <FieldError id="new-project-move_date-error" message={errors.move_date} />
        </div>
        <div className="stack">
          <label>
            По (если переезд на несколько дней)
            <input ref={endRef} type="date" value={dateEnd} min={date || undefined} disabled={locked}
              onChange={(e) => { setDateEnd(e.target.value); setBadDate((b) => ({ ...b, end: false })); clearServer('move_date_end') }}
              onBlur={checkDate('end', 'move_date_end')} {...invalidProps('move_date_end')} />
          </label>
          <FieldError id="new-project-move_date_end-error" message={errors.move_date_end} />
        </div>
      </div>
      {withAddresses ? <div className="form-grid">
        <AddressInput label="Откуда (необязательно)" value={from} onChange={setFrom} />
        <AddressInput label="Куда (необязательно)" value={to} onChange={setTo} />
      </div> : <button type="button" className="link small" onClick={() => setWithAddresses(true)}>Добавить адреса (необязательно)</button>}
      <label>Начальный план<select value={planMode} disabled={locked} onChange={e => { setPlanMode(e.target.value as 'standard' | 'empty'); setPlan(null) }}>
        <option value="standard">Стандартный план и список первого дня</option>
        <option value="empty">Пустой план — составлю самостоятельно</option>
      </select></label>
      {planMode === 'standard' ? <>
        <label>Первый день: что подготовить<textarea ref={firstDayRef} rows={4} value={firstDay} disabled={locked}
          onChange={e => { setFirstDay(e.target.value); clearServer('first_day') }} maxLength={4020} {...invalidProps('first_day')} /></label>
        <FieldError id="new-project-first_day-error" message={errors.first_day} />
        <p className="muted small">По одному пункту на строку. Список сохранится без коробок; привязать вещи к ним можно позже.</p>
      <PersonalPlanner moveDate={errors.move_date ? '' : date} plan={plan} onPlan={setPlan} busy={locked} onBusy={setGenerating} />
      </> : <p className="muted small">Без готовых задач и списка первого дня. Добавите их, когда будет удобно.</p>}
      <ErrorAlert message={alert} />
      <button className="primary" type="submit" disabled={locked}>Создать проект</button>
    </form>
  )
}
