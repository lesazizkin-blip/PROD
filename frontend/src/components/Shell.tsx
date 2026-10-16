import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import MembersPanel from './MembersPanel'
import PasswordModal from './PasswordModal'
import Icon from './Icons'
import Modal from './Modal'

const TABS = [
  { to: '/', label: 'План', icon: 'plan', end: true },
  { to: '/boxes', label: 'Коробки', icon: 'boxes' },
  { to: '/labels', label: 'Этикетки', icon: 'labels' },
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

  function closeProjects() {
    setSwitching(false)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">MoverMate</Link>
        <button className="project-switch" onClick={() => setSwitching(true)} aria-label={`Проект: ${current?.name ?? 'нет'}. Сменить`}>
          <span>{current?.name ?? 'Нет проекта'}</span>
          <Icon name="swap" />
        </button>
        <Link to="/scan" className="icon-link" aria-label="Сканировать QR"><Icon name="scan" /></Link>
      </header>

      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={'end' in t ? t.end : false} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>

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
