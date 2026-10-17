import { Link } from 'react-router-dom'
import { Calculator, Wallet } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { Progress } from '../../api/types'
import { useAsync } from '../../state/useAsync'
import { rub } from './money'
import './journey.css'

/** Итог переезда (этап «обжиться»): план, коробки, потери и бюджет одной сводкой + вход в инструменты пути. */
export default function JourneySummary({ pid, progress, lost }: { pid: string; progress: Progress; lost: number }) {
  const tasks = useAsync(() => api.tasks(pid), [pid])
  const budget = useAsync(() => api.budget(pid), [pid])
  const list = tasks.data ?? []
  const done = list.filter((t) => t.done).length
  const b = budget.data
  const delivered = progress.by_status.delivered + progress.by_status.unpacked
  return (
    <section className="card stack journey-summary" aria-label="Итог переезда">
      <span className="eyebrow accent">Итог переезда</span>
      <div className="journey-summary__grid">
        <div><b>{done} / {list.length}</b><span>задач выполнено</span></div>
        <div><b>{delivered} / {progress.boxes_total}</b><span>коробок доехало</span></div>
        <div><b>{progress.by_status.unpacked}</b><span>распаковано</span></div>
        <div><b className={lost ? 'over' : ''}>{lost}</b><span>вещей потеряно</span></div>
        <div><b>{b ? rub(b.actual) : '…'}</b><span>{b && b.planned ? `потрачено из ${rub(b.planned)}` : 'бюджет не задан'}</span></div>
      </div>
      <div className="row wrap">
        <Link to="/budget" className="button"><Wallet className="icon-sm" aria-hidden />Бюджет</Link>
        <Link to="/calculator" className="button"><Calculator className="icon-sm" aria-hidden />Калькулятор</Link>
      </div>
    </section>
  )
}
