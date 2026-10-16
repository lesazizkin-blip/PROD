import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import type { Stage, Task, TaskCreate } from '../api/types'
import ChecklistModal from '../components/ChecklistModal'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { STAGES, STAGE_LABELS, formatDate, formatTimeRange } from '../ui/format'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'

// Срок прошёл, а задача не выполнена (сравниваем даты в формате ГГГГ-ММ-ДД)
const isOverdue = (t: Task) => !t.done && !!t.due_date && t.due_date.slice(0, 10) < new Date().toLocaleDateString('sv-SE')

export default function PlanPage() {
  return <RequireProject>{(pid) => <Plan pid={pid} />}</RequireProject>
}

function Plan({ pid }: { pid: string }) {
  const project = useAsync(() => api.getProject(pid), [pid])
  const tasks = useAsync(() => api.tasks(pid), [pid])
  const firstDay = useAsync(() => api.firstDay(pid), [pid])
  // null - форма закрыта, 'new' - новая задача, Task - правка существующей
  const [form, setForm] = useState<'new' | Task | null>(null)
  const [smart, setSmart] = useState(false)

  const reloadAll = () => {
    project.reload()
    tasks.reload()
    firstDay.reload()
  }
  const { busy, error, run: act } = useAction(reloadAll)

  const list = tasks.data ?? []
  const done = list.filter((t) => t.done).length
  const first = firstDay.data ?? []
  const toggleTask = (t: Task) => act(() => api.updateTask(pid, t.id, { done: !t.done }))
  const removeTask = (t: Task) => window.confirm(`Удалить задачу «${t.title}»?`) && act(() => api.deleteTask(pid, t.id))

  return (
    <StateView loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={reloadAll}>
      <div className="card hero stack">
        <div>
          <h2>{project.data?.name ?? '…'}</h2>
          <div className="muted">{project.data ? `Переезд ${formatDate(project.data.move_date)}` : ' '}</div>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={done} aria-valuemax={list.length}>
          <span style={{ width: `${list.length ? (100 * done) / list.length : 0}%` }} />
        </div>
        <div className="row between">
          <span className="small">Выполнено {done} из {list.length}</span>
          <span className="row">
            <button className="link small" style={{ color: 'inherit' }} onClick={() => setSmart(true)}>Умный чек-лист</button>
            <Link to="/tips" className="small" style={{ color: 'inherit' }}>Памятки →</Link>
          </span>
        </div>
      </div>
      {error ? <div className="alert" role="alert">{error}</div> : null}

      {STAGES.map((stage) => {
        const items = list.filter((t) => t.stage === stage)
        if (items.length === 0) return null
        return (
          <section key={stage}>
            <SectionTitle>{STAGE_LABELS[stage]}</SectionTitle>
            <div className="card flush">
              {items.map((t) => (
                <label key={t.id} className={`list-row${t.done ? ' done' : ''}${isOverdue(t) ? ' overdue' : ''}`}>
                  <input type="checkbox" checked={t.done} disabled={busy} onChange={() => toggleTask(t)} />
                  <span className="grow">
                    <span className="title">{t.title}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {[t.due_date ? `${isOverdue(t) ? 'просрочено, ' : ''}до ${formatDate(t.due_date)}` : null, formatTimeRange(t.start_time, t.end_time), t.assignee].filter(Boolean).join(' · ')}
                    </span>
                    {t.category ? (
                      <span className="category-chip">
                        <span className="category-dot" style={{ background: t.category_color ?? 'var(--primary)' }} aria-hidden="true" />
                        {t.category}
                      </span>
                    ) : null}
                  </span>
                  <button type="button" className="link small" disabled={busy} aria-label={`Изменить «${t.title}»`} onClick={(e) => { e.preventDefault(); setForm(t) }}>✎</button>
                  <button type="button" className="link small" disabled={busy} aria-label={`Удалить «${t.title}»`} onClick={(e) => { e.preventDefault(); removeTask(t) }}>✕</button>
                </label>
              ))}
            </div>
          </section>
        )
      })}

      <section>
        <SectionTitle>Коробка первого дня</SectionTitle>
        <div className="card flush">
          {first.length === 0 ? <div className="list-row muted">Список пуст</div> : null}
          {first.map((f) => (
            <label key={f.id} className={f.done ? 'list-row done' : 'list-row'}>
              <input type="checkbox" checked={f.done} disabled={busy} onChange={() => act(() => api.updateFirstDay(pid, f.id, { done: !f.done }))} />
              <span className="grow title">{f.title}</span>
              <button type="button" className="link small" disabled={busy} aria-label={`Удалить «${f.title}»`} onClick={(e) => { e.preventDefault(); if (window.confirm(`Удалить «${f.title}»?`)) void act(() => api.deleteFirstDay(pid, f.id)) }}>✕</button>
            </label>
          ))}
        </div>
      </section>

      <button className="primary fab" onClick={() => setForm('new')}>+ Задача</button>
      {smart ? <ChecklistModal pid={pid} onClose={() => setSmart(false)} onApplied={reloadAll} /> : null}
      {form ? (
        <TaskModal
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          categories={categoryColors(list)}
          onSave={async (body) => {
            if (form === 'new') await api.createTask(pid, body)
            else await api.updateTask(pid, form.id, body)
            setForm(null)
            reloadAll()
          }}
        />
      ) : null}
    </StateView>
  )
}

const DEFAULT_CATEGORIES = ['Документы', 'Коробки', 'Грузчики', 'Быт']
const DEFAULT_COLOR = '#1f8f7a'

/** Категории для подсказки и их цвета: у уже использованной категории берём её цвет, чтобы он не расходился. */
function categoryColors(tasks: Task[]): Map<string, string> {
  const map = new Map<string, string>(DEFAULT_CATEGORIES.map((c) => [c, DEFAULT_COLOR]))
  for (const t of tasks) if (t.category) map.set(t.category, t.category_color ?? DEFAULT_COLOR)
  return map
}

export function TaskModal({ initial, onClose, onSave, categories }: { initial: Task | null; onClose: () => void; onSave: (body: TaskCreate) => Promise<void>; categories: Map<string, string> }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [assignee, setAssignee] = useState(initial?.assignee ?? '')
  const [stage, setStage] = useState<Stage>(initial?.stage ?? 'before')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [color, setColor] = useState(initial?.category_color ?? DEFAULT_COLOR)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeInvalid = !!startTime && !!endTime && endTime <= startTime
  const dirty = initial === null
    ? [title, assignee, dueDate, startTime, endTime, category].some((v) => v.trim() !== '')
    : title !== initial.title || assignee !== (initial.assignee ?? '') || stage !== initial.stage || dueDate !== (initial.due_date ?? '') ||
      startTime !== (initial.start_time?.slice(0, 5) ?? '') || endTime !== (initial.end_time?.slice(0, 5) ?? '') ||
      category !== (initial.category ?? '') || color !== (initial.category_color ?? DEFAULT_COLOR)

  function pickCategory(value: string) {
    setCategory(value)
    const known = categories.get(value.trim())
    if (known) setColor(known)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (timeInvalid) {
      setError('Время окончания должно быть позже времени начала')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        stage,
        title: title.trim(),
        assignee: assignee.trim() || null,
        due_date: dueDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        category: category.trim() || null,
        category_color: category.trim() ? color : null,
      })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={initial ? 'Изменить задачу' : 'Новая задача'} onClose={onClose} dirty={dirty}>
      <form className="stack" onSubmit={submit}>
        <label>
          Что сделать
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} data-autofocus />
        </label>
        <label>
          Ответственный (необязательно)
          <input value={assignee} onChange={(e) => setAssignee(e.target.value)} maxLength={80} />
        </label>
        <label>
          Этап
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <label>
          Дата (необязательно)
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="row wrap">
          <label className="grow">
            Начало
            <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setError(null) }} />
          </label>
          <label className="grow">
            Конец
            <input type="time" value={endTime} aria-invalid={timeInvalid} onChange={(e) => { setEndTime(e.target.value); setError(null) }} />
          </label>
        </div>
        <div className="row wrap">
          <label className="grow">
            Категория (необязательно)
            <input list="task-categories" value={category} onChange={(e) => pickCategory(e.target.value)} maxLength={40} />
            <datalist id="task-categories">{[...categories.keys()].map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label>
            Цвет
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={!category.trim()} title={category.trim() ? undefined : 'Сначала укажите категорию'} />
          </label>
        </div>
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || !title.trim()}>{initial ? 'Сохранить' : 'Добавить'}</button>
      </form>
    </Modal>
  )
}
