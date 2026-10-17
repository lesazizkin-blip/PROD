import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Bell, FolderOpen, ScanLine } from 'lucide-react'
import { api } from '../api/endpoints'
import { useAuth } from '../state/AuthContext'
import { useProjects } from '../state/ProjectContext'
import { useAsync } from '../state/useAsync'
import Avatar from './Avatar'
import BrandMark from './BrandMark'
import SidebarToggle from './SidebarToggle'
import NotificationsModal from './NotificationsModal'
import { JOURNEY_TABS, NAV_TABS, tabNumber } from './navTabs'
import { BoxNavigationProvider } from '../features/boxes/BoxNavigation'
import '../features/workspace.css'


/** Название раздела для хлебных крошек по адресу страницы. */
function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'План'
  if (/^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname)) return 'Этикетка'
  const box = pathname.match(/^\/projects\/[^/]+\/boxes\/(\d+)/)
  if (box) return `Коробка № ${box[1]}`
  const map: Record<string, string> = {
    '/boxes': 'Коробки', '/labels': 'Этикетки', '/labels/print': 'Печать этикеток', '/progress': 'Прогресс',
    '/calculator': 'Калькулятор', '/journey': 'Путь переезда', '/budget': 'Бюджет', '/moving-day': 'День переезда', '/tips': 'Памятки', '/scan': 'Сканер', '/new': 'Новый переезд', '/profile': 'Аккаунт', '/about': 'О нас', '/projects': 'Все проекты',
  }
  if (/^\/projects\/[^/]+\/settings/.test(pathname)) return 'Настройки проекта'
  return map[pathname] ?? (pathname.startsWith('/invite/') ? 'Приглашение' : 'MoverMate')
}

/** Desktop navigation can be collapsed explicitly; phones use bottom tabs. */
export default function Shell() {
  const { currentId, projects, select } = useProjects()
  const { user } = useAuth()
  const { pathname, state } = useLocation()
  const routeProject = pathname.match(/^\/projects\/([^/]+)\//)?.[1]
  const current = projects.find(p => p.id === (routeProject ?? currentId))
  const contextId = current?.id ?? currentId
  const adoptProject = () => { if (routeProject && current && current.id !== currentId) select(current.id) }
  const boxSection = /^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname) ? '/labels' : /^\/projects\/[^/]+\/boxes\/\d+$/.test(pathname) ? '/boxes' : null
  const [notifying, setNotifying] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  // красная точка на колокольчике: есть коробки, которые ждут описи содержимого
  const reminders = useAsync(() => (contextId ? api.reminders(contextId) : Promise.resolve([])), [contextId, pathname])
  const pending = reminders.data?.length ?? 0

  return (
    <div className={`shell${sidebarCompact ? ' is-sidebar-compact' : ''}`}>
      <aside className="sidebar" aria-label="Главное меню">
        <div className="sidebar-head">
        <Link to="/about" className="brand" aria-label="MoverMate: о нас">
          <BrandMark />
          <span>MoverMate</span>
        </Link>
        <SidebarToggle compact={sidebarCompact} onToggle={() => setSidebarCompact((value) => !value)} />
        </div>
        <p className="brand-caption">УЧЁТ ВЕЩЕЙ<br />И ПЛАН ПЕРЕЕЗДА</p>
        <nav id="sidebar-navigation" className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t, i) => {
            const active = pathname === t.to || (!t.end && pathname.startsWith(`${t.to}/`)) || boxSection === t.to
            return <Link key={t.to} to={t.to} onClick={adoptProject} aria-current={active ? 'page' : undefined} aria-label={t.label} title={sidebarCompact ? t.label : undefined} className={active ? 'tab active' : 'tab'}>
              <span className="tab-number" aria-hidden>{tabNumber(i)}</span>
              <t.icon className="icon" aria-hidden />
              <span className="tab-label">{t.label}</span>
              <span className="tab-short">{t.short}</span>
            </Link>
          })}
        </nav>
        <p className="sidebar-group">Путь переезда</p>
        <nav className="tabs tabs-journey" aria-label="Путь переезда">
          {JOURNEY_TABS.map(t => <Link key={t.to} to={t.to} onClick={adoptProject} aria-current={pathname === t.to ? 'page' : undefined} aria-label={t.label} title={sidebarCompact ? t.label : undefined} className={pathname === t.to ? 'tab active' : 'tab'}>
            <t.icon className="icon" aria-hidden /><span className="tab-label">{t.label}</span>
          </Link>)}
        </nav>
      </aside>

      <header className="topbar">
        <nav className="breadcrumb" aria-label="Вы здесь">
          <Link to="/projects" aria-label="Все проекты" title="Все проекты"><FolderOpen className="icon-sm" aria-hidden /><span>Все проекты</span></Link>
          {current && !['/projects', '/profile', '/new', '/about'].includes(pathname) ? <><span className="breadcrumb-project" aria-hidden="true">/</span><span className="breadcrumb-project" title={current.name}>{current.name}</span></> : null}
          {pathname !== '/projects' ? <><span aria-hidden="true"> / </span><span aria-current="page">{sectionTitle(pathname)}</span></> : null}
        </nav>
        <Link to="/scan" onClick={adoptProject} className="icon-link" aria-label="Сканировать QR"><ScanLine className="icon" aria-hidden /></Link>
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
        <BoxNavigationProvider><div key={pathname} className={`page-content${state?.cartonTransition ? '' : ' page-content--enter'}`}><Outlet /></div></BoxNavigationProvider>
      </main>

      {notifying ? <NotificationsModal key={contextId} pid={contextId} reminders={reminders.data ?? []} onClose={() => setNotifying(false)} /> : null}
    </div>
  )
}
