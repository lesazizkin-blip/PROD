import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { api } from '../../api/endpoints'
import type { Expense, ExpenseCategory } from '../../api/types'
import PageHeading from '../../components/PageHeading'
import RequireProject from '../../components/RequireProject'
import { useConfirm } from '../../state/confirm'
import { useAction } from '../../state/useAction'
import { useAsync } from '../../state/useAsync'
import ErrorAlert from '../../ui/ErrorAlert'
import ProgressBar from '../../ui/ProgressBar'
import StateView from '../../ui/StateView'
import { CATEGORY_LABELS, rub } from './money'
import './journey.css'

export default function BudgetPage() {
  return <RequireProject>{(pid) => <Budget pid={pid} />}</RequireProject>
}

/** Бюджет «план–факт»: план - из калькулятора или вручную, факт вносится по мере оплаты. */
function Budget({ pid }: { pid: string }) {
  const budget = useAsync(() => api.budget(pid), [pid])
  const { error, run } = useAction(() => budget.reload())
  const confirm = useConfirm()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [planned, setPlanned] = useState('')
  const b = budget.data

  const save = (e: Expense, field: 'planned' | 'actual', raw: string) => {
    const value = raw.trim() === '' ? null : Math.max(0, Math.round(Number(raw)))
    if (field === 'planned' && value === null) return
    if (value === e[field]) return
    void run(() => api.updateExpense(pid, e.id, { [field]: value }))
  }

  return (
    <div className="stack journey">
      <PageHeading title="Бюджет переезда">План против факта: сколько собирались потратить и сколько вышло.</PageHeading>
      <StateView loading={budget.loading && !b} error={budget.error} onRetry={budget.reload}>
        {b ? (
          <>
            <div className="plan-stats">
              <div className="stat"><b>{rub(b.planned)}</b><span>план</span></div>
              <div className="stat"><b>{rub(b.actual)}</b><span>потрачено</span><ProgressBar value={Math.min(b.actual, b.planned)} max={Math.max(b.planned, 1)} label="Потрачено из плана" /></div>
              <div className="stat"><b className={b.variance > 0 ? 'over' : 'under'}>{b.variance > 0 ? '+' : ''}{rub(b.variance)}</b><span>{b.variance > 0 ? 'перерасход по оплаченному' : 'экономия по оплаченному'}</span></div>
            </div>
            {b.items.length === 0 ? (
              <div className="state"><p>Статей пока нет. Добавьте вручную или перенесите смету из <Link to="/calculator">калькулятора</Link>.</p></div>
            ) : (
              <div className="card flush budget-table" role="table" aria-label="Статьи бюджета">
                <div className="budget-row budget-head" role="row">
                  <span role="columnheader">Статья</span><span role="columnheader">План, ₽</span><span role="columnheader">Факт, ₽</span><span />
                </div>
                {b.items.map((e) => (
                  <div key={`${e.id}-${e.planned}-${e.actual}`} className="budget-row" role="row">
                    <span className="grow"><b>{e.title}</b><span className="sub">{CATEGORY_LABELS[e.category]}</span></span>
                    <input type="number" min={0} aria-label={`План: ${e.title}`} defaultValue={e.planned} onBlur={(ev) => save(e, 'planned', ev.target.value)} />
                    <input type="number" min={0} aria-label={`Факт: ${e.title}`} placeholder="—" defaultValue={e.actual ?? ''} onBlur={(ev) => save(e, 'actual', ev.target.value)}
                      className={e.actual !== null && e.actual > e.planned ? 'over' : ''} />
                    <button className="link small" aria-label={`Удалить «${e.title}»`} onClick={async () => {
                      if (await confirm({ title: `Удалить «${e.title}»?`, message: 'Статья пропадёт из бюджета.' })) void run(() => api.deleteExpense(pid, e.id))
                    }}><Trash2 className="icon-sm" aria-hidden /></button>
                  </div>
                ))}
              </div>
            )}
            <form className="card budget-add" onSubmit={(ev) => {
              ev.preventDefault()
              const value = Math.max(0, Math.round(Number(planned) || 0))
              void run(async () => {
                await api.addExpense(pid, { category, title: title.trim(), planned: value })
                setTitle('')
                setPlanned('')
              })
            }}>
              <label>Статья<input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Например, грузчики" /></label>
              <label>Категория
                <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>План, ₽<input type="number" min={0} value={planned} onChange={(e) => setPlanned(e.target.value)} /></label>
              <button className="primary" type="submit" disabled={!title.trim()}>Добавить</button>
            </form>
            <ErrorAlert message={error} />
            <Link to="/calculator" className="small">Пересчитать в калькуляторе →</Link>
          </>
        ) : null}
      </StateView>
    </div>
  )
}
