import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, KeyRound, LogOut, Plus, ShieldCheck } from 'lucide-react'
import { api } from '../api/endpoints'
import type { Project } from '../api/types'
import AddressInput from '../components/AddressInput'
import Avatar from '../components/Avatar'
import MembersPanel from '../components/MembersPanel'
import PasswordModal from '../components/PasswordModal'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'
import { formatDate, plural } from '../ui/format'

// логин демо-входа для жюри: пароль у него сменить нельзя (сервер запрещает)
const DEMO_LOGIN = 'demo'

/** Личный кабинет: кто вошёл, мои проекты, настройки и участники выбранного проекта, пароль и выход.
 * Клик по проекту открывает его настройки здесь же; сам проект открывается только кнопкой с названием в шапке. */
export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { projects, currentId, reload, ready } = useProjects()
  const navigate = useNavigate()
  const [changingPassword, setChangingPassword] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const briefs = useAsync(() => api.myProjects(), [projects.length])
  if (!user) return null

  // настройки показываем для выбранного здесь проекта, по умолчанию - для открытого сейчас
  const selected = projects.find((p) => p.id === selectedId) ?? projects.find((p) => p.id === currentId)
  const owned = projects.filter((p) => p.role === 'owner').length
  const isDemo = user.username === DEMO_LOGIN
  const dates = new Map((briefs.data ?? []).map((b) => [b.id, b.move_date]))

  return (
    <div className="profile">
      <section className="card profile__hero">
        <Avatar name={user.username} size="lg" />
        <div className="grow">
          <h1>{user.username}</h1>
          <p className="muted">{isDemo ? 'Демо-аккаунт для знакомства с сервисом' : 'Личный кабинет MoverMate'}</p>
        </div>
        <div className="profile__stats">
          <div><b>{projects.length}</b><span>{plural(projects.length, ['проект', 'проекта', 'проектов'])}</span></div>
          <div><b>{owned}</b><span>мои</span></div>
          <div><b>{projects.length - owned}</b><span>помогаю</span></div>
        </div>
      </section>

      <SectionTitle>Мои проекты</SectionTitle>
      <StateView loading={!ready} error={null}>
        <div className="project-grid">
          {projects.map((p) => (
            <button
              key={p.id}
              className={p.id === selected?.id ? 'project-card current' : 'project-card'}
              aria-pressed={p.id === selected?.id}
              aria-label={`Настройки проекта «${p.name}»`}
              onClick={() => setSelectedId(p.id)}
            >
              <span className="project-card__name">{p.name}</span>
              <span className="muted small row">
                <Calendar className="icon-sm" aria-hidden />
                {dates.get(p.id) ? formatDate(dates.get(p.id)!) : 'дата не указана'}
              </span>
              <span className="row">
                <span className={p.role === 'owner' ? 'badge role-owner' : 'badge role-member'}>{p.role === 'owner' ? 'Владелец' : 'Участник'}</span>
                {p.id === currentId ? <span className="badge st-unpacked">Открыт сейчас</span> : null}
              </span>
            </button>
          ))}
          <button className="project-card project-card--new" onClick={() => navigate('/new')}>
            <Plus className="icon" aria-hidden />
            <span>Новый проект</span>
          </button>
        </div>
      </StateView>

      <p className="muted small">Нажмите на проект, чтобы открыть его настройки. Перейти к проекту можно кнопкой с его названием вверху.</p>

      {selected ? (
        <>
          <SectionTitle>{`Настройки проекта «${selected.name}»`}</SectionTitle>
          <ProjectSettings key={selected.id} pid={selected.id} onSaved={() => void reload()} />
          <div className="card">
            <MembersPanel
              key={selected.id}
              project={selected}
              me={user}
              onLeft={() => {
                setSelectedId(null)
                void reload()
              }}
            />
          </div>
        </>
      ) : null}

      <SectionTitle>Безопасность</SectionTitle>
      <section className="card stack">
        <p className="row muted small"><ShieldCheck className="icon-sm" aria-hidden />Мы храним только логин и хэш пароля: ни почты, ни телефона.</p>
        <div className="row wrap">
          {isDemo ? (
            <span className="muted small">У демо-аккаунта пароль общий, сменить его нельзя.</span>
          ) : (
            <button className="tonal" onClick={() => setChangingPassword(true)}><KeyRound className="icon-sm" aria-hidden />Сменить пароль</button>
          )}
          <button className="danger" onClick={() => void logout().then(() => navigate('/'))}><LogOut className="icon-sm" aria-hidden />Выйти</button>
        </div>
      </section>
      {changingPassword ? <PasswordModal onClose={() => setChangingPassword(false)} /> : null}
    </div>
  )
}

/** Название, дата и необязательные адреса «откуда» и «куда» (раздел 5.1 ТЗ). */
function ProjectSettings({ pid, onSaved }: { pid: string; onSaved: () => void }) {
  const project = useAsync(() => api.getProject(pid), [pid])
  return (
    <StateView loading={project.loading && !project.data} error={project.error} onRetry={project.reload}>
      {project.data ? <ProjectForm project={project.data} onSaved={onSaved} /> : null}
    </StateView>
  )
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
