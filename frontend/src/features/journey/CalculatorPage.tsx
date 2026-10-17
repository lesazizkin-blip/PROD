import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calculator } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { CalculatorIn, CalculatorOut } from '../../api/types'
import PageHeading from '../../components/PageHeading'
import { useAuth } from '../../state/AuthContext'
import { useProjects } from '../../state/ProjectContext'
import { useAction } from '../../state/useAction'
import { useAsync } from '../../state/useAsync'
import ErrorAlert from '../../ui/ErrorAlert'
import { CATEGORY_LABELS, mid, rub, rubRange } from './money'
import './journey.css'

const START: CalculatorIn = {
  rooms: 2, people: 2, distance_km: 10, floor_from: 1, floor_to: 1,
  elevator_from: true, elevator_to: true, pets: false, piano: false, many_fragile: false, move_date: null, city: null,
}

/** Этап «решение»: сколько стоит переезд, сколько коробок и времени. Доступен после входа, ничего не сохраняет. */

/** Без лифта этаж не выше 15-го, с лифтом - до 100 (так же проверяет сервер). */
const NO_ELEVATOR_MAX_FLOOR = 15
type NumKey = 'rooms' | 'people' | 'distance_km' | 'floor_from' | 'floor_to'
export default function CalculatorPage() {
  const { user } = useAuth()
  const { currentId } = useProjects()
  const navigate = useNavigate()
  const [form, setForm] = useState<CalculatorIn>(START)
  const [result, setResult] = useState<CalculatorOut | null>(null)
  const calc = useAction()
  const cities = useAsync(() => api.cities(), [])
  const toBudget = useAction()
  const set = <K extends keyof CalculatorIn>(key: K, value: CalculatorIn[K]) => {
    const next = { ...form, [key]: value }
    if (!next.elevator_from) next.floor_from = Math.min(next.floor_from, 15)
    if (!next.elevator_to) next.floor_to = Math.min(next.floor_to, 15)
    setForm(next)
    setResult(null)
  }
  const setElevator = (key: 'elevator_from' | 'elevator_to', on: boolean) => {
    const floorKey = key === 'elevator_from' ? 'floor_from' : 'floor_to'
    // набранный, но ещё не принятый этаж тоже приводим к пределу без лифта
    const base = committed()
    setForm({ ...base, [key]: on, [floorKey]: on ? base[floorKey] : Math.min(base[floorKey], NO_ELEVATOR_MAX_FLOOR) })
    setDrafts({})
    setResult(null)
  }
  // Поле можно стереть и набрать число заново: черновик - строка, в форму оно попадает при уходе
  // из поля или при расчёте, приведённое к пределам (так же проверяет сервер), с подсказкой
  const [drafts, setDrafts] = useState<Partial<Record<NumKey, string>>>({})
  const [hint, setHint] = useState<string | null>(null)
  const limits = (f: CalculatorIn): Record<NumKey, [number, number, string]> => ({
    rooms: [1, 8, 'Комнат'],
    people: [1, 10, 'Человек'],
    distance_km: [0, 500, 'Расстояние, км'],
    floor_from: [0, f.elevator_from ? 100 : NO_ELEVATOR_MAX_FLOOR, 'Этаж сейчас'],
    floor_to: [0, f.elevator_to ? 100 : NO_ELEVATOR_MAX_FLOOR, 'Этаж на новом месте'],
  })
  const committed = (): CalculatorIn => {
    const next = { ...form }
    const bounds = limits(form)
    for (const [key, raw] of Object.entries(drafts) as [NumKey, string][]) {
      const [min, max, label] = bounds[key]
      const value = Number.parseInt(raw, 10)
      const clamped = Number.isNaN(value) ? min : Math.max(min, Math.min(max, value))
      if (clamped !== value) setHint(`${label}: от ${min} до ${max}${key.startsWith('floor') ? ' (без лифта не выше 15-го)' : ''}`)
      next[key] = clamped
    }
    return next
  }
  const commit = () => {
    if (!Object.keys(drafts).length) return
    setForm(committed())
    setDrafts({})
  }
  const num = (key: NumKey, label: string, min: number, max: number) => (
    <label>
      {label}
      <input type="number" inputMode="numeric" min={min} max={max} value={drafts[key] ?? String(form[key])}
        onChange={(e) => { setDrafts({ ...drafts, [key]: e.target.value }); setHint(null); setResult(null) }}
        onBlur={commit} />
    </label>
  )

  return (
    <div className="stack journey">
      <PageHeading title="Калькулятор переезда">Прикиньте бюджет, коробки и сроки ещё до того, как начать.</PageHeading>
      <form className="card stack" onSubmit={calc.submit(async () => {
        const body = committed()
        setForm(body)
        setDrafts({})
        setResult(await api.calculator({ ...body, move_date: body.move_date || null }))
      })}>
        <div className="calc-grid">
          <label>
            Город
            <select value={form.city ?? ''} onChange={(e) => set('city', e.target.value || null)}>
              <option value="">Другой — средние по крупным городам</option>
              {(cities.data ?? []).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </label>
          {num('rooms', 'Комнат (студия = 1)', 1, 8)}
          {num('people', 'Сколько человек переезжает', 1, 10)}
          {num('distance_km', 'Расстояние, км', 0, 500)}
          <label>
            Дата переезда (необязательно)
            <input type="date" value={form.move_date ?? ''} onChange={(e) => set('move_date', e.target.value || null)} />
          </label>
          {num('floor_from', 'Этаж сейчас', 0, form.elevator_from ? 100 : NO_ELEVATOR_MAX_FLOOR)}
          {num('floor_to', 'Этаж на новом месте', 0, form.elevator_to ? 100 : NO_ELEVATOR_MAX_FLOOR)}
        </div>
        <div className="row wrap calc-flags">
          <label className="row"><input type="checkbox" checked={form.elevator_from} onChange={(e) => setElevator('elevator_from', e.target.checked)} />Лифт сейчас</label>
          <label className="row"><input type="checkbox" checked={form.elevator_to} onChange={(e) => setElevator('elevator_to', e.target.checked)} />Лифт на новом месте</label>
          <label className="row"><input type="checkbox" checked={form.pets} onChange={(e) => set('pets', e.target.checked)} />Питомцы</label>
          <label className="row"><input type="checkbox" checked={form.piano} onChange={(e) => set('piano', e.target.checked)} />Пианино</label>
          <label className="row"><input type="checkbox" checked={form.many_fragile} onChange={(e) => set('many_fragile', e.target.checked)} />Много хрупкого</label>
        </div>
        {hint ? <p className="small muted" role="status">{hint}</p> : null}
        <ErrorAlert message={calc.error} />
        <button className="primary" type="submit" disabled={calc.busy}><Calculator className="icon-sm" aria-hidden />{calc.busy ? 'Считаем…' : 'Рассчитать'}</button>
      </form>

      {result ? (
        <section className="stack" aria-label="Оценка переезда">
          <div className="move-ticket">
            <div className="stack">
              <span className="eyebrow">Оценка переезда</span>
              <h2>{rubRange(result.total)}</h2>
              <p className="small">{result.assumptions}</p>
            </div>
            <div className="date-stamp">
              <strong>{result.prep_weeks} нед.</strong>
              <span>НА ПОДГОТОВКУ</span>
            </div>
          </div>
          <div className="plan-stats">
            <div className="stat"><b>{result.boxes.low}–{result.boxes.high}</b><span>коробок</span></div>
            <div className="stat"><b>{result.volume_m3.low}–{result.volume_m3.high} м³</b><span>{result.vehicle}</span></div>
            <div className="stat"><b>{result.movers} × {result.hours.low}–{result.hours.high} ч</b><span>грузчики</span></div>
          </div>
          <div className="card flush">
            {result.costs.map((c) => (
              <div key={c.title} className="list-row">
                <span className="grow"><b>{c.title}</b><span className="sub">{CATEGORY_LABELS[c.category]}</span></span>
                <span>{rubRange(c.cost)}</span>
              </div>
            ))}
          </div>
          <div className="card stack">
            <b>Про дату</b>
            <ul className="plain">{result.date_advice.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
          <ErrorAlert message={toBudget.error} />
          {!user ? (
            <Link to="/auth?mode=register" className="button primary">Начать переезд: план, коробки и бюджет</Link>
          ) : currentId ? (
            <button className="primary" disabled={toBudget.busy} onClick={() => toBudget.run(async () => {
              for (const c of result.costs) await api.addExpense(currentId, { category: c.category, title: c.title, planned: mid(c.cost) })
              navigate('/budget')
            })}>
              {toBudget.busy ? 'Переносим…' : `Перенести смету в бюджет проекта (${rub(result.costs.reduce((s, c) => s + mid(c.cost), 0))})`}
            </button>
          ) : (
            <Link to="/new" className="button primary">Создать переезд</Link>
          )}
        </section>
      ) : null}
    </div>
  )
}
