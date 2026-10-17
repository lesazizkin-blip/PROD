import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, Calendar, FolderOpen, Plus, Settings2, Undo2 } from 'lucide-react'
import { useProjects } from '../state/ProjectContext'
import { useAuth } from '../state/AuthContext'
import { useAsync } from '../state/useAsync'
import { useLocalProjectArchive } from '../state/localProjectArchive'
import PageHeading from '../components/PageHeading'
import StateView from '../ui/StateView'
import ErrorAlert from '../ui/ErrorAlert'
import { formatDate } from '../ui/format'

export default function ProjectsPage() {
  const { user } = useAuth()
  return user ? <ProjectList key={user.id} userId={user.id} /> : null
}

function ProjectList({ userId }: { userId: number }) {
  const { projects, currentId, select, ready, reload } = useProjects()
  const refresh = useAsync(() => reload(), [reload], { refreshOnFocus: true })
  const { ids, archive, error } = useLocalProjectArchive(userId)
  const [tab, setTab] = useState<'active' | 'archive'>('active')
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const active = projects.filter(p => !ids.includes(p.id))
  const archived = projects.filter(p => ids.includes(p.id))
  const list = (tab === 'active' ? active : archived).filter(p => p.name.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')))
  return <div className="stack projects-page">
    <div className="page-toolbar"><PageHeading title="Все проекты">Выберите переезд, чтобы открыть его план, коробки и прогресс.</PageHeading><Link to="/new" className="button primary"><Plus className="icon-sm" aria-hidden />Новый проект</Link></div>
    <div className="project-list-tools"><div className="segmented" role="tablist" aria-label="Список проектов"><button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}><FolderOpen className="icon-sm" aria-hidden />Активные ({active.length})</button><button role="tab" aria-selected={tab === 'archive'} className={tab === 'archive' ? 'on' : ''} onClick={() => setTab('archive')}><Archive className="icon-sm" aria-hidden />Архив ({archived.length})</button></div><input type="search" aria-label="Найти проект" placeholder="Название проекта" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <p className="muted small">Архив хранится на этом устройстве. Данные и доступ к проектам сохраняются; на других устройствах этот список не синхронизируется.</p>
    <ErrorAlert message={error ?? refresh.error} />
    {refresh.error ? <button onClick={refresh.reload}>Повторить загрузку проектов</button> : null}
    <StateView loading={!ready || (refresh.loading && projects.length === 0)} error={null}>
      {list.length ? <div className="project-grid">{list.map(p => <article key={p.id} className={`project-card${p.id === currentId ? ' current' : ''}`}>
        <div className="row between wrap"><span className={`badge ${p.role === 'owner' ? 'role-owner' : 'role-member'}`}>{p.role === 'owner' ? 'Владелец' : 'Помогаю'}</span>{p.id === currentId ? <span className="badge st-unpacked">Открыт сейчас</span> : null}</div>
        <h2 className="project-card__name">{p.name}</h2>
        <p className="muted small row"><Calendar className="icon-sm" aria-hidden />{p.move_date ? formatDate(p.move_date) : 'Дата не указана'}</p>
        <button className={p.id === currentId ? 'tonal' : 'primary'} aria-label={`${p.id === currentId ? 'Открыть' : 'Выбрать'} проект «${p.name}»`} onClick={() => { select(p.id); navigate('/') }}>Открыть проект</button>
        <div className="row between wrap project-card__secondary"><Link to={`/projects/${p.id}/settings`} className="button small" aria-label={`Настройки проекта «${p.name}»`}><Settings2 className="icon-sm" aria-hidden />Настройки</Link><button className="link" aria-label={`${tab === 'archive' ? 'Восстановить' : 'Архивировать'} проект «${p.name}»`} onClick={() => { archive(p.id, tab !== 'archive'); setTab(tab === 'archive' ? 'active' : 'archive') }}>{tab === 'archive' ? <Undo2 className="icon-sm" aria-hidden /> : <Archive className="icon-sm" aria-hidden />}{tab === 'archive' ? 'Вернуть' : 'В архив'}</button></div>
      </article>)}</div> : <section className="project-empty stack"><FolderOpen className="project-empty__icon" aria-hidden /><h2>{query ? 'Проект не найден' : tab === 'archive' ? 'Архив пока пуст' : 'Нет активных проектов'}</h2><p className="muted">{query ? 'Попробуйте другое название.' : tab === 'archive' ? 'Здесь будут проекты, которые вы убрали в архив на этом устройстве.' : 'Создайте новый переезд или верните проект из архива.'}</p>{!query && tab === 'active' ? <Link to="/new" className="button primary">Создать проект</Link> : null}</section>}
    </StateView>
  </div>
}
