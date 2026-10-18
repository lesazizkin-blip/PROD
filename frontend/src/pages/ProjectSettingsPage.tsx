import RequireProject from '../components/RequireProject'
import { useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Settings2, Trash2, Users } from 'lucide-react'
import { api } from '../api/endpoints'
import type { Project } from '../api/types'
import AddressInput from '../components/AddressInput'
import MembersPanel from '../components/MembersPanel'
import { useAuth } from '../state/AuthContext'
import { useConfirm } from '../state/confirm'
import { useProjects } from '../state/ProjectContext'
import { useAsync } from '../state/useAsync'
import { useAction } from '../state/useAction'
import StateView from '../ui/StateView'
import ErrorAlert from '../ui/ErrorAlert'

// общий демо-проект жюри удалить нельзя (сервер отвечает 403), поэтому кнопку не показываем
const DEMO_PROJECT_ID = '00000000-0000-4000-8000-000000000001'

export default function ProjectSettingsPage() {
  const { pid = '' } = useParams()
  return <RequireProject pid={pid}>{() => <ProjectSettings key={pid} pid={pid} />}</RequireProject>
}

function ProjectSettings({ pid }: { pid: string }) {
  const { user } = useAuth()
  const { projects, reload } = useProjects()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'settings' | 'members'>('settings')
  const project = useAsync(() => api.getProject(pid), [pid])
  const brief = projects.find(p => p.id === pid)
  return <div className="stack project-settings-page">
    <Link to="/projects" className="button back-link"><ArrowLeft className="icon-sm" aria-hidden />Все проекты</Link>
    <StateView loading={project.loading && !project.data} error={project.error} onRetry={project.reload}>
      {project.data ? <>
        <div><h1>{project.data.name}</h1><p className="muted">Настройки этого переезда и его участники.</p></div>
        <div className="segmented" role="tablist" aria-label="Настройки проекта">
          <button role="tab" aria-selected={tab === 'settings'} className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}><Settings2 className="icon-sm" aria-hidden />Переезд</button>
          <button role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'on' : ''} onClick={() => setTab('members')}><Users className="icon-sm" aria-hidden />Помощники</button>
        </div>
        {tab === 'settings' ? <section role="tabpanel" aria-label="Переезд"><ProjectForm project={project.data} onSaved={() => { project.reload(); void reload() }} />
          {brief?.role === 'owner' && pid !== DEMO_PROJECT_ID ? <DeleteProject project={project.data} onDeleted={() => { void reload(); navigate('/projects') }} /> : null}</section> : user && brief ? <section className="card" role="tabpanel" aria-label="Помощники"><MembersPanel project={brief} me={user} onLeft={() => { void reload(); navigate('/projects') }} /></section> : null}
      </> : null}
    </StateView>
  </div>
}

function ProjectForm({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const [name, setName] = useState(project.name)
  const [date, setDate] = useState(project.move_date)
  const [from, setFrom] = useState(project.address_from ?? '')
  const [to, setTo] = useState(project.address_to ?? '')
  const [saved, setSaved] = useState(false)
  const { busy, error, submit } = useAction()
  const invalid = !name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)

  const save = async () => {
    await api.updateProject(project.id, {
      name: name.trim(),
      move_date: date,
      address_from: from.trim() || null,
      address_to: to.trim() || null,
    })
    setSaved(true)
    onSaved()
  }
  // после правки снова показываем кнопку без «Сохранено»
  const editValue = (set: (v: string) => void) => (v: string) => {
    set(v)
    setSaved(false)
  }
  const edit = (set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => editValue(set)(e.target.value)

  return (
    <form className="card stack" onSubmit={submit(save)}>
      <div className="form-grid">
        <label>
          Название
          <input value={name} onChange={edit(setName)} maxLength={120} />
        </label>
        <label>
          Дата переезда
          <input type="date" value={date} onChange={edit(setDate)} />
        </label>
        <AddressInput label="Откуда (необязательно)" value={from} onChange={editValue(setFrom)} placeholder="ул. Садовая, 5" />
        <AddressInput label="Куда (необязательно)" value={to} onChange={editValue(setTo)} placeholder="ул. Лесная, 12" />
      </div>
      <p className="muted small">Адреса видят только участники этого проекта и больше никто.</p>
      <ErrorAlert message={error} />
      <div className="row">
        <button className="primary" type="submit" disabled={busy || invalid}>Сохранить</button>
        {saved ? <span className="muted small" role="status">Сохранено</span> : null}
      </div>
    </form>
  )
}

/** Удалить проект со всем содержимым может только владелец; перед этим - подтверждение. */
function DeleteProject({ project, onDeleted }: { project: { id: string; name: string }; onDeleted: () => void }) {
  const confirm = useConfirm()
  const { busy, error, run } = useAction()
  return (
    <div className="card stack">
      <ErrorAlert message={error} />
      <button type="button" className="danger" disabled={busy} onClick={async () => {
        const ok = await confirm({
          title: `Удалить проект «${project.name}»?`,
          message: 'Пропадут все коробки, вещи, задачи и бюджет. Участники потеряют доступ. Отменить нельзя.',
          confirmLabel: 'Удалить проект',
        })
        if (ok) void run(async () => { await api.deleteProject(project.id); onDeleted() })
      }}><Trash2 className="icon-sm" aria-hidden />Удалить проект</button>
    </div>
  )
}
