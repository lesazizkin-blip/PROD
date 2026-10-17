import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ScanLine } from 'lucide-react'
import { api } from '../api/endpoints'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import { useAsync } from '../state/useAsync'
import Avatar from './Avatar'
import BrandMark from './BrandMark'
import Modal from './Modal'
import NotificationsModal from './NotificationsModal'
import { NAV_TABS, tabNumber } from './navTabs'
import { formatShortDate } from '../ui/format'


/** Название раздела для хлебных крошек по адресу страницы. */
function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'План'
  if (/^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname)) return 'Этикетка'
  const box = pathname.match(/^\/projects\/[^/]+\/boxes\/(\d+)/)
  if (box) return `Коробка № ${box[1]}`
  const map: Record<string, string> = {
    '/boxes': 'Коробки', '/labels': 'Этикетки', '/labels/print': 'Печать этикеток', '/progress': 'Прогресс',
    '/tips': 'Памятки', '/scan': 'Сканер', '/new': 'Новый переезд', '/profile': 'Личный кабинет', '/about': 'О нас',
  }
  return map[pathname] ?? (pathname.startsWith('/invite/') ? 'Приглашение' : 'MoverMate')
}

/** Каркас по макету: бежевая панель слева с номерами разделов (на телефоне - вкладки снизу), шапка с крошками, сканером и уведомлениями. Проект открывается только кнопкой с его названием. */
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
        <Link to="/about" className="brand" aria-label="MoverMate: о нас">
          <BrandMark />
          <span>MoverMate</span>
        </Link>
        <p className="brand-caption">УЧЁТ ВЕЩЕЙ<br />И ПЛАН ПЕРЕЕЗДА</p>
        <button className="project-switch" onClick={() => setSwitching(true)} aria-label={`Проект: ${current?.name ?? 'нет'}. Сменить`}>
          <span>{current?.name ?? 'Нет проекта'}</span>
          <span className="project-date">
            {current?.move_date ? formatShortDate(current.move_date) : current ? 'Сменить проект' : 'Создайте переезд'}
          </span>
        </button>
        <nav className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t, i) => (
            <NavLink key={t.to} to={t.to} end={t.end} aria-label={t.label} className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              <span className="tab-number" aria-hidden>{tabNumber(i)}</span>
              <t.icon className="icon" aria-hidden />
              <span className="tab-label">{t.label}</span>
              <span className="tab-short">{t.short}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <header className="topbar">
        <nav className="breadcrumb" aria-label="Вы здесь">
          <Link to="/profile">Личное пространство</Link> / <span aria-current="page">{sectionTitle(pathname)}</span>
        </nav>
        <Link to="/scan" className="icon-link" aria-label="Сканировать QR"><ScanLine className="icon" aria-hidden /></Link>
        <button className="icon-link" onClick={() => setNotifying(true)} aria-label={pending ? `Уведомления: ${pending}` : 'Уведомления и журнал'}>
          <Bell className="icon" aria-hidden />
          {pending ? <span className="dot" aria-hidden /> : null}
        </button>
        <Link to="/profile" className="account-button" aria-label="Личный кабинет">
          <span className="account-name">{user?.username}</span>
          <Avatar name={user?.username ?? ''} />
        </Link>
      </header>

      <main className="container">
        <Outlet />
      </main>

      {switching ? (
        <Modal title="Проекты" onClose={() => setSwitching(false)}>
          <ul className="plain project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  className={p.id === currentId ? 'project-option current' : 'project-option'}
                  aria-current={p.id === currentId ? 'true' : undefined}
                  onClick={() => {
                    select(p.id)
                    setSwitching(false)
                    navigate('/')
                  }}
                >
                  <span className="project-option__name">{p.name}</span>
                  <span className="project-option__meta">
                    {p.move_date ? formatShortDate(p.move_date) : 'Дата не указана'}
                    {p.role === 'member' ? ' · помощник' : ''}
                    {p.id === currentId ? ' · открыт' : ''}
                  </span>
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
            + Новый проект
          </button>
        </Modal>
      ) : null}
      {notifying ? <NotificationsModal pid={currentId} reminders={reminders.data ?? []} onClose={() => setNotifying(false)} /> : null}
    </div>
  )
}
