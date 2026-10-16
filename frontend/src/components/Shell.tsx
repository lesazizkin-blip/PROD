import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useProjects } from '../state/ProjectContext'
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
  const { projects, currentId, select } = useProjects()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  const current = projects.find((p) => p.id === currentId)

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">MoverMate</Link>
        <button className="project-switch" onClick={() => setSwitching(true)} aria-label="Сменить проект">
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
        <Modal title="Проекты" onClose={() => setSwitching(false)}>
          <ul className="plain">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === currentId ? 'row-btn selected' : 'row-btn'}
                  onClick={() => {
                    select(p.id)
                    setSwitching(false)
                    navigate('/')
                  }}
                >
                  {p.id === currentId ? '✓ ' : ''}{p.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            className="primary"
            onClick={() => {
              setSwitching(false)
              navigate('/new')
            }}
          >
            Новый проект
          </button>
        </Modal>
      ) : null}
    </div>
  )
}
