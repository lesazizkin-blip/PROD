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
  elevator_from: true, elevator_to: true, pets: false, piano: false, many_fragile: false, move_date: null,
}

/** Этап «решение»: сколько стоит переезд, сколько коробок и времени. Доступно после входа, ничего не сохраняет. */
export default function CalculatorPage() {
  const { user } = useAuth()
  const { currentId } = useProjects()
  const navigate = useNavigate()
  const [form, setForm] = useState<CalculatorIn>(START)
  const [result, setResult] = useState<CalculatorOut | null>(null)
  const cities = useAsync(() => api.cities(), [])
  const calc = useAction()
  const toBudget = useAction()
  const set = <K extends keyof CalculatorIn>(key: K, value: CalculatorIn[K]) => {
    const next = { ...form, [key]: value }
    if (!next.elevator_from) next.floor_from = Math.min(next.floor_from, 15)
    if (!next.elevator_to) next.floor_to = Math.min(next.floor_to, 15)
    setForm(next)
    setResult(null)
  }
  const num = (key: 'rooms' | 'people' | 'distance_km' | 'floor_from' | 'floor_to', label: string, min: number, max: number) => (
    <label>
      {label}
      <input type="number" min={min} max={max} value={form[key]} onChange={(e) => set(key, Math.max(min, Math.min(max, e.target.valueAsNumber || min)))} />
    </label>
  )

  return (
    <div className="stack journey">
      <PageHeading title="Калькулятор переезда">Прикиньте бюджет, коробки и сроки ещё до того, как начать.</PageHeading>
      <form className="card stack" onSubmit={calc.submit(async () => setResult(await api.calculator({ ...form, move_date: form.move_date || null })))}>
        <div className="calc-grid">
          <label>Город<select value={form.city ?? ''} onChange={e => set('city', e.target.value || null)}><option value="">Средние цены по крупным городам</option>{cities.data?.map(c => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
          {num('rooms', 'Комнат (студия = 1)', 1, 8)}
          {num('people', 'Сколько человек переезжает', 1, 10)}
          {num('distance_km', 'Расстояние, км', 0, 500)}
          <label>
            Дата переезда (необязательно)
            <input type="date" value={form.move_date ?? ''} onChange={(e) => set('move_date', e.target.value || null)} />
          </label>
          {num('floor_from', 'Этаж сейчас', 0, form.elevator_from ? 100 : 15)}
          {num('floor_to', 'Этаж на новом месте', 0, form.elevator_to ? 100 : 15)}
        </div>
        <div className="row wrap calc-flags">
          <label className="row"><input type="checkbox" checked={form.elevator_from} onChange={(e) => set('elevator_from', e.target.checked)} />Лифт сейчас</label>
          <label className="row"><input type="checkbox" checked={form.elevator_to} onChange={(e) => set('elevator_to', e.target.checked)} />Лифт на новом месте</label>
          <label className="row"><input type="checkbox" checked={form.pets} onChange={(e) => set('pets', e.target.checked)} />Питомцы</label>
          <label className="row"><input type="checkbox" checked={form.piano} onChange={(e) => set('piano', e.target.checked)} />Пианино</label>
          <label className="row"><input type="checkbox" checked={form.many_fragile} onChange={(e) => set('many_fragile', e.target.checked)} />Много хрупкого</label>
        </div>
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
