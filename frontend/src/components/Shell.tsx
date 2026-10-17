import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Bell, Route, ScanLine } from 'lucide-react'
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


/** Название раздела для хлебных крошек по адресу страницы. */
function sectionTitle(pathname: string): string {
  if (pathname === '/') return 'План'
  if (/^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname)) return 'Этикетка'
  const box = pathname.match(/^\/projects\/[^/]+\/boxes\/(\d+)/)
  if (box) return `Коробка № ${box[1]}`
  const map: Record<string, string> = {
    '/boxes': 'Коробки', '/labels': 'Этикетки', '/labels/print': 'Печать этикеток', '/progress': 'Прогресс',
    '/tips': 'Памятки', '/calculator': 'Калькулятор', '/journey': 'Путь переезда', '/budget': 'Бюджет', '/scan': 'Сканер', '/new': 'Новый переезд', '/profile': 'Личный кабинет', '/about': 'О нас',
  }
  return map[pathname] ?? (pathname.startsWith('/invite/') ? 'Приглашение' : 'MoverMate')
}

/** Desktop navigation can be collapsed explicitly; phones use bottom tabs. */
export default function Shell() {
  const { currentId } = useProjects()
  const { user } = useAuth()
  const { pathname } = useLocation()
  const boxSection = /^\/projects\/[^/]+\/boxes\/\d+\/label/.test(pathname) ? '/labels' : /^\/projects\/[^/]+\/boxes\/\d+$/.test(pathname) ? '/boxes' : null
  const [notifying, setNotifying] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)
  // красная точка на колокольчике: есть коробки, которые ждут описи содержимого
  const reminders = useAsync(() => (currentId ? api.reminders(currentId) : Promise.resolve([])), [currentId, pathname])
  const pending = reminders.data?.length ?? 0

  return (
    <div className={`shell${sidebarCompact ? ' is-sidebar-compact' : ''}`}>
      <aside className="sidebar" aria-label="Главное меню">
        <SidebarToggle compact={sidebarCompact} onToggle={() => setSidebarCompact((value) => !value)} />
        <Link to="/about" className="brand" aria-label="MoverMate: о нас">
          <BrandMark />
          <span>MoverMate</span>
        </Link>
        <p className="brand-caption">УЧЁТ ВЕЩЕЙ<br />И ПЛАН ПЕРЕЕЗДА</p>
        <nav className="tabs tabs-journey tabs-top" aria-label="Путь переезда">
          <Link to="/journey" aria-current={pathname === '/journey' ? 'page' : undefined} aria-label="Путь переезда" title={sidebarCompact ? 'Путь переезда' : undefined} className={pathname === '/journey' ? 'tab active' : 'tab'}>
            <Route className="icon" aria-hidden />
            <span className="tab-label">Путь переезда</span>
          </Link>
        </nav>
        <nav id="sidebar-navigation" className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t, i) => {
            const active = pathname === t.to || (!t.end && pathname.startsWith(`${t.to}/`)) || boxSection === t.to
            return <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined} aria-label={t.label} title={sidebarCompact ? t.label : undefined} className={active ? 'tab active' : 'tab'}>
              <span className="tab-number" aria-hidden>{tabNumber(i)}</span>
              <t.icon className="icon" aria-hidden />
              <span className="tab-label">{t.label}</span>
              <span className="tab-short">{t.short}</span>
            </Link>
          })}
        </nav>
        <p className="sidebar-group">Бюджет и расчёты</p>
        <nav className="tabs tabs-journey" aria-label="Бюджет и расчёты">
          {JOURNEY_TABS.map((t) => {
            const active = pathname === t.to
            return <Link key={t.to} to={t.to} aria-current={active ? 'page' : undefined} aria-label={t.label} title={sidebarCompact ? t.label : undefined} className={active ? 'tab active' : 'tab'}>
              <t.icon className="icon" aria-hidden />
              <span className="tab-label">{t.label}</span>
            </Link>
          })}
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
        <BoxNavigationProvider><Outlet /></BoxNavigationProvider>
      </main>

      {notifying ? <NotificationsModal pid={currentId} reminders={reminders.data ?? []} onClose={() => setNotifying(false)} /> : null}
    </div>
  )
}
