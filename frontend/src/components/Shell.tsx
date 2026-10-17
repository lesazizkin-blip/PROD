import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, ChartColumn, ClipboardList, Package, QrCode, ScanLine, Settings, Sparkles } from 'lucide-react'
import { api } from '../api/endpoints'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import { useAsync } from '../state/useAsync'
import Avatar from './Avatar'
import BrandMark from './BrandMark'
import HealthBadge from './HealthBadge'
import Icon from './Icons'
import Modal from './Modal'
import NotificationsModal from './NotificationsModal'

const TABS = [
  { to: '/', label: 'План', icon: ClipboardList, end: true },
  { to: '/boxes', label: 'Коробки', icon: Package },
  { to: '/labels', label: 'Этикетки', icon: QrCode },
  { to: '/progress', label: 'Прогресс', icon: ChartColumn },
] as const

/** Название раздела для хлебных крошек по адресу страницы. */
function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'План'
  if (/^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname)) return 'Этикетка'
  const box = pathname.match(/^\/projects\/[^/]+\/boxes\/(\d+)/)
  if (box) return `Коробка № ${box[1]}`
  const map: Record<string, string> = {
    '/boxes': 'Коробки', '/labels': 'Этикетки', '/labels/print': 'Печать этикеток', '/progress': 'Прогресс',
    '/tips': 'Памятки', '/scan': 'Сканер', '/new': 'Новый переезд', '/profile': 'Личный кабинет',
  }
  return map[pathname] ?? (pathname.startsWith('/invite/') ? 'Приглашение' : 'MoverMate')
}

/** Каркас: тёмная панель слева (на телефоне - вкладки снизу), шапка с проектом, уведомлениями и ассистентом. */
export default function Shell() {
  const { projects, currentId, select } = useProjects()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [switching, setSwitching] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const current = projects.find((p) => p.id === currentId)
  // красная точка на колокольчике: есть коробки, которые ждут описи содержимого
  const reminders = useAsync(() => (currentId ? api.reminders(currentId) : Promise.resolve([])), [currentId, pathname])
  const pending = reminders.data?.length ?? 0

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar__brand" aria-label="MoverMate: на главную">
          <BrandMark />
          <span>MoverMate</span>
        </Link>
        <nav className="tabs" aria-label="Разделы">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={'end' in t ? t.end : false} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              <t.icon className="icon" aria-hidden />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <Link to="/profile" className="sidebar__me" aria-label="Личный кабинет">
            <Avatar name={user?.username ?? ''} />
            <span className="sidebar__name">{user?.username}</span>
          </Link>
          <Link to="/profile" className="square-btn" aria-label="Настройки"><Settings className="icon" aria-hidden /></Link>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <Link to="/" className="topbar__brand" aria-label="MoverMate: на главную"><BrandMark /></Link>
          <nav className="crumbs" aria-label="Вы здесь">
            <Link to="/profile">Мои проекты</Link>
            <span aria-hidden>/</span>
            <span aria-current="page">{sectionTitle(pathname)}</span>
          </nav>
          <button className="project-switch" onClick={() => setSwitching(true)} aria-label={`Проект: ${current?.name ?? 'нет'}. Сменить`}>
            <span>{current?.name ?? 'Нет проекта'}</span>
            <Icon name="swap" />
          </button>
          <div className="topbar__actions">
            <Link to="/scan" className="icon-link" aria-label="Сканировать QR"><ScanLine className="icon" aria-hidden /></Link>
            <Link to="/tips" className="icon-link hide-mobile" aria-label="Памятки"><BookOpen className="icon" aria-hidden /></Link>
            <button className="icon-link" onClick={() => setNotifying(true)} aria-label={pending ? `Уведомления: ${pending}` : 'Уведомления и журнал'}>
              <Bell className="icon" aria-hidden />
              {pending ? <span className="dot" aria-hidden /> : null}
            </button>
            <HealthBadge />
            <button
              className="ai-btn"
              disabled={!currentId}
              onClick={() => navigate('/?assistant=1')}
              aria-label="Умный ассистент: чек-лист под ваш переезд"
              title="Умный ассистент"
            >
              <Sparkles className="icon-sm" aria-hidden />AI
            </button>
            <Link to="/profile" className="topbar__me" aria-label="Личный кабинет"><Avatar name={user?.username ?? ''} /></Link>
          </div>
        </header>

        <main className="container">
          <Outlet />
        </main>
      </div>

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
                  {p.role === 'member' ? <span className="muted small"> · участник</span> : null}
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
          <Link to="/profile" className="small" onClick={() => setSwitching(false)}>Участники, настройки проекта и выход — в личном кабинете</Link>
        </Modal>
      ) : null}
      {notifying ? <NotificationsModal pid={currentId} reminders={reminders.data ?? []} onClose={() => setNotifying(false)} /> : null}
    </div>
  )
}
