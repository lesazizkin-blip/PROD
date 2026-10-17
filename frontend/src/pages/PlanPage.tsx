import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Clock, Package, Pencil, Sparkles, UserRound } from 'lucide-react'
import { api } from '../api/endpoints'
import { ITEM_STATUSES, type ItemStatus, type Stage, type Task, type TaskCreate } from '../api/types'
import ChecklistModal from '../components/ChecklistModal'
import PageHeading from '../components/PageHeading'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useConfirm } from '../state/confirm'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import ProgressBar from '../ui/ProgressBar'
import StateView from '../ui/StateView'
import { ITEM_STATUS_LABELS, STAGES, STAGE_LABELS, boxPath, daysUntil, formatDate, formatTimeRange, plural } from '../ui/format'
import { errorMessage } from '../api/client'

// Вкладки плана: три этапа переезда и отдельно коробка первого дня
type PlanTab = Stage | 'first-day'

// Срок прошёл, а задача не выполнена (сравниваем даты в формате ГГГГ-ММ-ДД)
const isOverdue = (t: Task) => !t.done && !!t.due_date && t.due_date.slice(0, 10) < new Date().toLocaleDateString('sv-SE')

export default function PlanPage() {
  return <RequireProject>{(pid) => <Plan pid={pid} />}</RequireProject>
}

function Plan({ pid }: { pid: string }) {
  const project = useAsync(() => api.getProject(pid), [pid])
  const tasks = useAsync(() => api.tasks(pid), [pid])
  const firstDayItems = useAsync(() => api.firstDayItems(pid), [pid], { refreshOnFocus: true })
  const progress = useAsync(() => api.progress(pid), [pid])
  // null - форма закрыта, 'new' - новая задача, Task - правка существующей
  const [form, setForm] = useState<'new' | Task | null>(null)
  const [addingItem, setAddingItem] = useState(false)
  const [quickError, setQuickError] = useState<string | null>(null)
  const [smart, setSmart] = useState(false)
  const [tab, setTab] = useState<PlanTab | null>(null)

  const reloadAll = () => {
    project.reload()
    tasks.reload()
    firstDayItems.reload()
    progress.reload()
  }

  const list = tasks.data ?? []
  const done = list.filter((t) => t.done).length
  // по умолчанию открыт первый этап, где остались невыполненные задачи; выбранный один раз этап
  // дальше не меняется сам, иначе после отметки последней задачи вкладка перепрыгивала бы
  const activeTab: PlanTab = tab ?? STAGES.find((s) => list.some((t) => t.stage === s && !t.done)) ?? 'before'
  const stageTasks = list.filter((t) => t.stage === activeTab)

  // Отметки срабатывают сразу на экране, запрос идёт следом; при ошибке данные перечитываются
  const quick = (apply: () => void, request: () => Promise<unknown>, rollback: () => void) => {
    setQuickError(null)
    apply()
    request().catch((e) => {
      setQuickError(errorMessage(e))
      rollback()
    })
  }
  const toggleTask = (t: Task) => {
    if (tab === null) setTab(activeTab) // закрепляем вкладку до отметки
    quick(
      () => tasks.mutate((ts) => ts?.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) ?? ts),
      () => api.updateTask(pid, t.id, { done: !t.done }),
      tasks.reload,
    )
  }
  const thingsForDay = firstDayItems.data ?? []
  const boxes = progress.data
  const days = project.data ? daysUntil(project.data.move_date) : null
  const countdown = days === null ? '…' : days > 0 ? `${days} дн.` : days === 0 ? 'Сегодня' : 'Уже дома'

  return (
    <StateView loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={reloadAll}>
      <PageHeading title="План переезда">
        {project.data ? formatDate(project.data.move_date) : '…'} · {days !== null && days > 0 ? `${days} ${plural(days, ['день', 'дня', 'дней'])} до переезда` : 'Ваш переезд'}
      </PageHeading>
      <div className="move-ticket">
        <div className="stack">
          <span className="eyebrow">Маршрут / {project.data?.name ?? 'ваш переезд'}</span>
          <h2>Упаковка вещей<br />{boxes ? `${boxes.boxes_total - boxes.by_status.packing} из ${boxes.boxes_total} коробок готовы` : 'Загружаем прогресс…'}</h2>
          <p className="small">{[project.data?.address_from, project.data?.address_to].filter(Boolean).join(' → ') || 'Впереди — новый дом.'}</p>
        </div>
        <div className="date-stamp">
          <strong>{project.data ? formatDate(project.data.move_date).slice(0, 5).replace('.', ' / ') : '…'}</strong>
          <span>ДАТА ПЕРЕЕЗДА</span>
        </div>
      </div>
      <div className="plan-stats">
        <div className="stat"><b>{done} / {list.length}</b><span>задач выполнено</span><ProgressBar value={done} max={list.length} label="Выполнено задач" /></div>
        <div className="stat"><b>{boxes ? `${boxes.boxes_total - boxes.by_status.packing} / ${boxes.boxes_total}` : '…'}</b><span>коробок собрано</span></div>
        <div className="stat"><b>{countdown}</b><span>до нового дома</span></div>
      </div>

      <div className="plan-tasks stack">
      <div className="row between">
        <h2>Ближайшие дела</h2>
        <button className="link" onClick={() => setSmart(true)}><Sparkles className="icon-sm" aria-hidden />Умный чек-лист →</button>
      </div>
      <ErrorAlert message={quickError} />

      <div className="segmented stage-tabs" role="tablist" aria-label="Этапы переезда">
        {STAGES.map((s) => {
          const items = list.filter((t) => t.stage === s)
          return (
            <button key={s} type="button" role="tab" aria-selected={s === activeTab} className={s === activeTab ? 'on' : ''} onClick={() => setTab(s)}>
              {STAGE_LABELS[s]} <span className="count">{items.filter((t) => t.done).length}/{items.length}</span>
            </button>
          )
        })}
        <button type="button" role="tab" aria-selected={activeTab === 'first-day'} className={activeTab === 'first-day' ? 'on' : ''} onClick={() => setTab('first-day')}>
          Первый день <span className="count">{thingsForDay.length}</span>
        </button>
      </div>

      {activeTab === 'first-day' ? (
        <section role="tabpanel" aria-label="Первый день" className="stack">
          {thingsForDay.length === 0 ? (
            <div className="state"><p>Пока нет. Добавьте вещь кнопкой «+ Вещь» или отметьте «Первый день» у вещи в карточке коробки.</p></div>
          ) : (
          <div className="card flush">
            {thingsForDay.map((x) => (
              <Link key={x.item.id} to={boxPath(pid, x.box_number)} className="list-row">
                <Package className="icon-sm" aria-hidden />
                <span className="grow">
                  <b>{x.item.name}</b>
                  <span className="sub">Коробка № {x.box_number} · {x.room}</span>
                </span>
                <span className={`badge it-${x.item.status}`}>{ITEM_STATUS_LABELS[x.item.status]}</span>
              </Link>
            ))}
          </div>
          )}
        </section>
      ) : (
      <section className="task-list" role="tabpanel" aria-label={STAGE_LABELS[activeTab]}>
        {list.length === 0 ? (
          <div className="state"><p>Пока задач нет. Добавьте свою кнопкой «+ Задача» или выберите готовые в «Умном чек-листе».</p></div>
        ) : stageTasks.length === 0 ? <div className="state"><p>На этом этапе задач нет.</p></div> : null}
        {stageTasks.map((t) => (
          <label key={t.id} className={`task-card${t.done ? ' done' : ''}${isOverdue(t) ? ' overdue' : ''}`}>
            <input type="checkbox" className="check" checked={t.done} onChange={() => toggleTask(t)} />
            <span className="grow">
              <span className="title">{t.title}</span>
              <span className="task-meta">
                {t.due_date ? <span className={isOverdue(t) ? 'meta-chip late' : 'meta-chip'}><CalendarDays className="icon-xs" aria-hidden />{isOverdue(t) ? 'просрочено, ' : ''}до {formatDate(t.due_date)}</span> : null}
                {formatTimeRange(t.start_time, t.end_time) ? <span className="meta-chip"><Clock className="icon-xs" aria-hidden />{formatTimeRange(t.start_time, t.end_time)}</span> : null}
                {t.assignee ? <span className="meta-chip"><UserRound className="icon-xs" aria-hidden />{t.assignee}</span> : null}
                {t.category ? (
                  <span className="category-chip">
                    <span className="category-dot" style={{ background: t.category_color ?? 'var(--primary)' }} aria-hidden="true" />
                    {t.category}
                  </span>
                ) : null}
              </span>
            </span>
            <button type="button" className="link small icon-btn" aria-label={`Изменить «${t.title}»`} onClick={(e) => { e.preventDefault(); setForm(t) }}><Pencil className="icon-sm" aria-hidden /></button>
          </label>
        ))}
      </section>
      )}
      </div>

      {activeTab === 'first-day'
        ? <button className="primary fab" onClick={() => setAddingItem(true)}>+ Вещь</button>
        : <button className="primary fab" onClick={() => setForm('new')}>+ Задача</button>}
      {addingItem ? (
        <FirstDayItemModal
          pid={pid}
          onClose={() => setAddingItem(false)}
          onSaved={() => {
            setAddingItem(false)
            firstDayItems.reload()
          }}
        />
      ) : null}
      {smart ? <ChecklistModal pid={pid} onClose={() => setSmart(false)} onApplied={reloadAll} /> : null}
      {form ? (
        <TaskModal
          initial={form === 'new' ? null : form}
          defaultStage={activeTab === 'first-day' ? undefined : activeTab}
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

export function TaskModal({ initial, defaultStage, onClose, onSave, onDelete, categories }: { initial: Task | null; defaultStage?: Stage; onClose: () => void; onSave: (body: TaskCreate) => Promise<void>; onDelete?: () => Promise<void>; categories: Map<string, string> }) {
  const confirm = useConfirm()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [assignee, setAssignee] = useState(initial?.assignee ?? '')
  // новая задача попадает на этап, открытый сейчас в плане
  const [stage, setStage] = useState<Stage>(initial?.stage ?? defaultStage ?? 'before')
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
  async function remove() {
    if (!onDelete || !initial || !(await confirm({ title: `Удалить задачу «${initial.title}»?`, message: 'Задача пропадёт из плана.' }))) return
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

/** «+ Вещь» на вкладке «Первый день»: вещь сразу кладётся в выбранную коробку и помечается вещью первого дня. */
function FirstDayItemModal({ pid, onClose, onSaved }: { pid: string; onClose: () => void; onSaved: () => void }) {
  const boxes = useAsync(() => api.boxes(pid, { page_size: 200 }), [pid])
  const [name, setName] = useState('')
  const [box, setBox] = useState('')
  const [status, setStatus] = useState<ItemStatus>('packed')
  const { busy, error, submit } = useAction()
  const list = boxes.data?.items ?? []
  const invalid = !name.trim() || !box

  return (
    <Modal title="Вещь первого дня" onClose={onClose} dirty={name.trim() !== ''}>
      <form className="stack" onSubmit={submit(async () => {
        await api.createItem(pid, Number(box), { name: name.trim(), first_day: true, status })
        onSaved()
      })}>
        <label>
          Что это
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Например: чайник" data-autofocus />
        </label>
        <label>
          В какой коробке
          <select value={box} onChange={(e) => setBox(e.target.value)} disabled={boxes.loading && !boxes.data}>
            <option value="">{list.length ? 'Выберите коробку' : 'Сначала создайте коробку на вкладке «Коробки»'}</option>
            {list.map((b) => <option key={b.number} value={b.number}>№ {b.number} · {b.room}</option>)}
          </select>
        </label>
        <label>
          Где вещь сейчас
          <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
            {ITEM_STATUSES.map((s) => <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <ErrorAlert message={error ?? boxes.error} />
        <button className="primary" type="submit" disabled={busy || invalid}>Добавить</button>
      </form>
    </Modal>
  )
}
