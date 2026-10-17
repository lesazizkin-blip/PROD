import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { Stage, Task, TaskCreate } from '../api/types'
import ChecklistModal from '../components/ChecklistModal'
import Modal from '../components/Modal'
import PageHeading from '../components/PageHeading'
import RequireProject from '../components/RequireProject'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import ProgressBar from '../ui/ProgressBar'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import { STAGES, STAGE_LABELS, boxPath, formatDate, formatTimeRange } from '../ui/format'

// Срок прошёл, а задача не выполнена (сравниваем даты в формате ГГГГ-ММ-ДД)
const isOverdue = (t: Task) => !t.done && !!t.due_date && t.due_date.slice(0, 10) < new Date().toLocaleDateString('sv-SE')

export default function PlanPage() {
  return <RequireProject>{(pid) => <Plan pid={pid} />}</RequireProject>
}

function Plan({ pid }: { pid: string }) {
  const project = useAsync(() => api.getProject(pid), [pid])
  const progress = useAsync(() => api.progress(pid), [pid])
  const tasks = useAsync(() => api.tasks(pid), [pid])
  const packedFirstDay = useAsync(() => api.firstDayItems(pid), [pid], { refreshOnFocus: true })
  const firstDay = useAsync(() => api.firstDay(pid), [pid])
  // null - форма закрыта, 'new' - новая задача, Task - правка существующей
  const [form, setForm] = useState<'new' | Task | null>(null)
  const [smart, setSmart] = useState(false)
  const [activeStage, setActiveStage] = useState<Stage>('before')
  const [today] = useState(() => new Date(new Date().toDateString()).getTime())

  const reloadAll = () => {
    project.reload()
    tasks.reload()
    firstDay.reload()
    packedFirstDay.reload()
  }
  const { busy, error, run: act } = useAction(reloadAll)

  const list = tasks.data ?? []
  const done = list.filter((t) => t.done).length
  const first = firstDay.data ?? []
  const days = project.data ? Math.ceil((new Date(`${project.data.move_date}T00:00:00`).getTime() - today) / 86400000) : null
  const countdown = days === null ? '…' : days > 0 ? `${days} дн.` : days === 0 ? 'Сегодня' : 'Уже дома'
  const dateStamp = project.data ? new Date(`${project.data.move_date}T12:00:00`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }).replace('.', ' / ') : '…'
  const toggleTask = (t: Task) => act(() => api.updateTask(pid, t.id, { done: !t.done }))

  return (
    <StateView loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={reloadAll}>
      <PageHeading title="План переезда">{project.data ? formatDate(project.data.move_date) : '…'} · {days !== null && days > 0 ? `${days} дн. до переезда` : 'Ваш переезд'}</PageHeading>
      <div className="move-ticket">
        <div className="stack">
          <span className="eyebrow">МАРШРУТ / {project.data?.name ?? 'ВАШ ПЕРЕЕЗД'}</span>
          <h2>Упаковка вещей<br />{progress.data ? `${progress.data.boxes_total - progress.data.by_status.packing} из ${progress.data.boxes_total} коробок готовы` : 'Загружаем прогресс…'}</h2>
          <p className="small">{[project.data?.address_from, project.data?.address_to].filter(Boolean).join(' → ') || 'Впереди — новый дом.'}</p>
        </div>
        <div className="date-stamp"><strong>{dateStamp}</strong><span>ДАТА ПЕРЕЕЗДА</span><span className="stamp-arrows">↑↑ THIS SIDE UP</span></div>
      </div>
      <div className="plan-stats">
        <div className="stat"><b>{done} / {list.length}</b><span>задач выполнено</span><ProgressBar value={done} max={list.length} label="Выполнено задач" /></div>
        <div className="stat"><b>{progress.data ? progress.data.boxes_total - progress.data.by_status.packing : '…'} / {progress.data?.boxes_total ?? '…'}</b><span>коробок собрано</span></div>
        <div className="stat"><b>{countdown}</b><span>до нового дома</span></div>
      </div>
      <div className="plan-layout">
      <div className="plan-tasks stack">
        <div className="row between"><h2>Ближайшие дела</h2><button className="link small" onClick={() => setSmart(true)}>Умный чек-лист →</button></div>
      <ErrorAlert message={error} />
      {!list.some(t => t.template_id !== null) ? <button disabled={busy} onClick={() => act(() => api.applyTemplates(pid))}>Добавить стандартные задачи</button> : null}

      <div className="stage-tabs" role="group" aria-label="Этапы переезда">
        {STAGES.map((stage) => <button key={stage} className={stage === activeStage ? 'on' : ''} aria-pressed={stage === activeStage} onClick={() => setActiveStage(stage)}>{STAGE_LABELS[stage]}</button>)}
      </div>
      {STAGES.filter((stage) => stage === activeStage).map((stage) => {
        const items = list.filter((t) => t.stage === stage)
        if (items.length === 0) return <p key={stage} className="muted">На этом этапе задач пока нет. Добавьте свою.</p>
        return (
          <section key={stage}>
            <SectionTitle>{STAGE_LABELS[stage]}</SectionTitle>
            <div className="card flush">
              {items.map((t) => (
                <label key={t.id} className={`list-row${t.done ? ' done' : ''}${isOverdue(t) ? ' overdue' : ''}`}>
                  <input type="checkbox" checked={t.done} disabled={busy} onChange={() => toggleTask(t)} />
                  <span className="grow">
                    <span className="title">{t.title}</span>
                    <span className="sub">
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
                </label>
              ))}
            </div>
          </section>
        )
      })}

      </div>
      <aside className="first-day stack">
        <span className="eyebrow accent">ОТКРЫТЬ ПЕРВОЙ</span>
        <h2>Коробка<br />первого дня</h2>
        <p>Чайник, зарядки, зубные щётки и постельное бельё — в одну коробку.</p>
      <section>
        <SectionTitle>Коробка первого дня</SectionTitle>
        {(packedFirstDay.data ?? []).map(({ item, box_number, room }) => <div key={item.id} className="list-row">
          <input type="checkbox" aria-label={`Распакована: ${item.name}`} checked={item.status === 'unpacked'} disabled={busy} onChange={() => act(() => api.updateItem(pid, item.id, { status: item.status === 'unpacked' ? 'packed' : 'unpacked' }))} />
          <span className="grow">{item.name}<Link className="sub" to={boxPath(pid, box_number)}>Коробка {box_number} · {room}</Link></span>
        </div>)}
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

        <Link to="/tips" className="button dark">Памятки по упаковке →</Link>
        <span className="eyebrow muted">ПАМЯТКА № 01</span>
      </aside>
      </div>
      <button className="primary fab" onClick={() => setForm('new')}>+ Задача</button>
      {smart ? <ChecklistModal pid={pid} onClose={() => setSmart(false)} onApplied={reloadAll} /> : null}
      {form ? (
        <TaskModal
          initial={form === 'new' ? null : form}
          onClose={() => setForm(null)}
          categories={categoryColors(list)}
          onDelete={form === 'new' ? undefined : async () => {
            await api.deleteTask(pid, form.id)
            setForm(null)
            reloadAll()
          }}
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

export function TaskModal({ initial, onClose, onSave, onDelete, categories }: { initial: Task | null; onClose: () => void; onSave: (body: TaskCreate) => Promise<void>; onDelete?: () => Promise<void>; categories: Map<string, string> }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [assignee, setAssignee] = useState(initial?.assignee ?? '')
  const [stage, setStage] = useState<Stage>(initial?.stage ?? 'before')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? '')
  const [startTime, setStartTime] = useState(initial?.start_time?.slice(0, 5) ?? '')
  const [endTime, setEndTime] = useState(initial?.end_time?.slice(0, 5) ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [color, setColor] = useState(initial?.category_color ?? DEFAULT_COLOR)
  const { busy, error, setError, run, submit } = useAction()
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

  // Удаление живёт в форме правки: в строке списка остаётся одна кнопка, и название не сжимается на телефоне
  function remove() {
    if (!onDelete || !initial || !window.confirm(`Удалить задачу «${initial.title}»?`)) return
    void run(onDelete)
  }

  const save = async () => {
    // та же граница, что на сервере: ошибка видна сразу, без запроса
    if (timeInvalid) throw new Error('Время окончания должно быть позже времени начала')
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
  }

  return (
    <Modal title={initial ? 'Изменить задачу' : 'Новая задача'} onClose={onClose} dirty={dirty}>
      <form className="stack" onSubmit={submit(save)}>
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
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !title.trim()}>{initial ? 'Сохранить' : 'Добавить'}</button>
        {onDelete ? <button type="button" className="danger" disabled={busy} onClick={remove}>Удалить задачу</button> : null}
      </form>
    </Modal>
  )
}
