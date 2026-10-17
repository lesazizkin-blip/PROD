import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import MembersPanel from './MembersPanel'
import PasswordModal from './PasswordModal'
import Icon from './Icons'
import Modal from './Modal'
import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'

const TABS = [
  { to: '/', label: 'План переезда', icon: 'plan', end: true },
  { to: '/boxes', label: 'Коробки и поиск', icon: 'boxes' },
  { to: '/labels', label: 'QR-этикетки', icon: 'labels' },
  { to: '/progress', label: 'Прогресс', icon: 'progress' },
] as const

/** Каркас: шапка с проектом и сканером; вкладки снизу на телефоне и слева на ноутбуке. */
export default function Shell() {
  const { projects, currentId, select, reload } = useProjects()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const current = projects.find((p) => p.id === currentId)

  const project = useAsync(() => currentId ? api.getProject(currentId) : Promise.resolve(null), [currentId])

  function closeProjects() {
    setSwitching(false)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <img src="/assets/box-mark.svg" width="36" height="36" alt="" />
          <span>MoverMate</span>
        </Link>
        <p className="brand-caption">УЧЁТ ВЕЩЕЙ<br />И ПЛАН ПЕРЕЕЗДА</p>
        <button className="project-switch" onClick={() => setSwitching(true)} aria-label={`Проект: ${current?.name ?? 'нет'}. Сменить`}>
          <span>{current?.name ?? 'Нет проекта'}</span>
          <span className="project-date">{project.data ? new Date(`${project.data.move_date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'Создайте свой переезд'} <Icon name="swap" /></span>
        </button>
        <nav className="tabs" aria-label="Разделы">
          {TABS.map((t, i) => (
            <NavLink key={t.to} to={t.to} end={'end' in t ? t.end : false} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              <span className="tab-number" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="sidebar-note">↑↑ БЕРЕЖНО<br />Каждая вещь на месте.</p>
      </aside>
      <header className="topbar">
        <span className="breadcrumb">ЛИЧНОЕ ПРОСТРАНСТВО / {current?.name ?? 'НОВЫЙ ПЕРЕЕЗД'}</span>
        <button className="account-button" onClick={() => setSwitching(true)} aria-label="Проекты и аккаунт">
          <span>{user?.username}</span><span className="avatar" aria-hidden>{user?.username.slice(0, 2).toUpperCase()}</span>
        </button>
        <Link to="/scan" className="icon-link" aria-label="Сканировать QR"><Icon name="scan" /></Link>
      </header>

      <main className="container">
        <Outlet />
      </main>

      {switching ? (
        <Modal title="Проекты" onClose={closeProjects}>
          <ul className="plain">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === currentId ? 'row-btn selected' : 'row-btn'}
                  onClick={() => {
                    select(p.id)
                    closeProjects()
                    navigate('/')
                  }}
                >
                  {p.id === currentId ? '✓ ' : ''}{p.name}
                  {p.role === 'member' ? <span className="muted small"> · участник</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <Link to="/profile" className="button" onClick={closeProjects}>Настройки профиля и проектов</Link>
          <button
            className="primary"
            onClick={() => {
              closeProjects()
              navigate('/new')
            }}
          >
            Новый проект
          </button>

          {current && user ? (
            <MembersPanel
              project={current}
              me={user}
              onLeft={() => {
                closeProjects()
                void reload().then(() => navigate('/'))
              }}
            />
          ) : null}

          <div className="row between account">
            <span className="muted small">Вы вошли как <b>{user?.username}</b></span>
            <span className="row">
              <button
                className="link small"
                onClick={() => {
                  closeProjects()
                  setChangingPassword(true)
                }}
              >
                Сменить пароль
              </button>
              <button
                className="link small"
                onClick={() => {
                  closeProjects()
                  void logout().then(() => navigate('/'))
                }}
              >
                Выйти
              </button>
            </span>
          </div>
        </Modal>
      ) : null}
      {changingPassword ? <PasswordModal onClose={() => setChangingPassword(false)} /> : null}
    </div>
  )
}
