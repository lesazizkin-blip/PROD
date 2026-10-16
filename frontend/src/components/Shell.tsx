import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api/endpoints'
import { useAuth } from '../state/AuthContext'
import { useAction } from '../state/useAction'
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const invite = useAction()
  const current = projects.find((p) => p.id === currentId)

  const makeInvite = () =>
    invite.run(async () => {
      if (!currentId) return
      const { path } = await api.createInvite(currentId)
      setInviteUrl(`${window.location.origin}${path}`)
      setCopied(false)
    })

  async function copyInvite() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
    } catch {
      setCopied(false) // буфер обмена недоступен: ссылку можно выделить и скопировать вручную
    }
  }

  function closeProjects() {
    setSwitching(false)
    setInviteUrl(null)
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

          {current?.role === 'owner' ? (
            <section className="stack invite">
              <h3>Помощники</h3>
              <p className="muted small">Пригласите грузчика или родных: по ссылке они войдут в «{current.name}» и смогут отмечать коробки. Ссылка действует 7 дней.</p>
              {inviteUrl ? (
                <div className="row">
                  <input className="grow" value={inviteUrl} readOnly aria-label="Ссылка-приглашение" onFocus={(e) => e.currentTarget.select()} />
                  <button className="tonal" onClick={() => void copyInvite()}>{copied ? 'Скопировано' : 'Копировать'}</button>
                </div>
              ) : (
                <button className="tonal" disabled={invite.busy} onClick={() => void makeInvite()}>Пригласить по ссылке</button>
              )}
              {invite.error ? <div className="alert" role="alert">{invite.error}</div> : null}
            </section>
          ) : null}

          <div className="row between account">
            <span className="muted small">Вы вошли как <b>{user?.username}</b></span>
            <button
              className="link small"
              onClick={() => {
                closeProjects()
                void logout().then(() => navigate('/'))
              }}
            >
              Выйти
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
