import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import { errorMessage } from '../api/client'
import type { Stage, Task } from '../api/types'
import ChecklistModal from '../components/ChecklistModal'
import Modal from '../components/Modal'
import RequireProject from '../components/RequireProject'
import { useAsync } from '../state/useAsync'
import { STAGES, STAGE_LABELS, formatDate } from '../ui/format'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'

export default function PlanPage() {
  return <RequireProject>{(pid) => <Plan pid={pid} />}</RequireProject>
}

function Plan({ pid }: { pid: string }) {
  const project = useAsync(() => api.getProject(pid), [pid])
  const tasks = useAsync(() => api.tasks(pid), [pid])
  const firstDay = useAsync(() => api.firstDay(pid), [pid])
  const [adding, setAdding] = useState(false)
  const [smart, setSmart] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reloadAll = () => {
    project.reload()
    tasks.reload()
    firstDay.reload()
  }

  async function act(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      reloadAll()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

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
                <label key={t.id} className={t.done ? 'list-row done' : 'list-row'}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleTask(t)} />
                  <span className="grow">
                    <span className="title">{t.title}</span>
                    <span className="sub" style={{ display: 'block' }}>
                      {[t.due_date ? `до ${formatDate(t.due_date)}` : null, t.assignee].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <button type="button" className="link small" aria-label={`Удалить «${t.title}»`} onClick={(e) => { e.preventDefault(); removeTask(t) }}>✕</button>
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
              <input type="checkbox" checked={f.done} onChange={() => act(() => api.updateFirstDay(pid, f.id, { done: !f.done }))} />
              <span className="grow title">{f.title}</span>
              <button type="button" className="link small" aria-label={`Удалить «${f.title}»`} onClick={(e) => { e.preventDefault(); if (window.confirm(`Удалить «${f.title}»?`)) void act(() => api.deleteFirstDay(pid, f.id)) }}>✕</button>
            </label>
          ))}
        </div>
      </section>

      <button className="primary fab" onClick={() => setAdding(true)}>+ Задача</button>
      {smart ? <ChecklistModal pid={pid} onClose={() => setSmart(false)} onApplied={reloadAll} /> : null}
      {adding ? (
        <AddTaskModal
          onClose={() => setAdding(false)}
          onSave={async (stage, title, assignee) => {
            await api.createTask(pid, { stage, title, assignee: assignee || null })
            setAdding(false)
            reloadAll()
          }}
        />
      ) : null}
    </StateView>
  )
}

function AddTaskModal({ onClose, onSave }: { onClose: () => void; onSave: (stage: Stage, title: string, assignee: string) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [stage, setStage] = useState<Stage>('before')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(stage, title.trim(), assignee.trim())
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title="Новая задача" onClose={onClose} dirty={title.trim() !== ''}>
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
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <button className="primary" type="submit" disabled={busy || !title.trim()}>Добавить</button>
      </form>
    </Modal>
  )
}
