import { useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { CircleHelp, Route } from 'lucide-react'
import FaqModal from './FaqModal'
import BrandMark from './BrandMark'
import SidebarToggle from './SidebarToggle'
import { NAV_TABS, tabNumber } from './navTabs'

/** Каркас для гостя: те же разделы слева, но вместо перехода - уведомление, что сначала нужна регистрация. */
export default function GuestShell() {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [faq, setFaq] = useState(false)
  const [sidebarCompact, setSidebarCompact] = useState(false)

  const needAccount = (section: string) => {
    setNotice(`Раздел «${section}» доступен после регистрации. Зарегистрируйтесь или войдите, чтобы пользоваться MoverMate.`)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 4000)
  }

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
          <Link to="/journey" className="tab" aria-label="Путь переезда">
            <Route className="icon" aria-hidden />
            <span className="tab-label">Путь переезда</span>
          </Link>
        </nav>
        <nav id="sidebar-navigation" className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t, i) => (
            <button key={t.label} type="button" className="tab" aria-label={t.label} title={sidebarCompact ? t.label : undefined} onClick={() => needAccount(t.label)}>
              <span className="tab-number" aria-hidden>{tabNumber(i)}</span>
              <t.icon className="icon" aria-hidden />
              <span className="tab-label">{t.label}</span>
              <span className="tab-short">{t.short}</span>
            </button>
          ))}
        </nav>
        <div className="guest-faq">
          <button type="button" className="sidebar__me sidebar__faq" aria-label="Вопросы" title={sidebarCompact ? 'Вопросы' : undefined} onClick={() => setFaq(true)}>
            <CircleHelp className="icon" aria-hidden />
            <span className="sidebar__name">Вопросы</span>
          </button>
        </div>
      </aside>

      <>
        <header className="topbar">
          <Link to="/about" className="topbar__brand" aria-label="MoverMate: о нас"><img src="/assets/box-mark.svg" width="36" height="36" alt="" /></Link>
          <span className="breadcrumb">MoverMate</span>
          {/* на телефоне боковой панели нет: путь переезда и вопросы - в шапке */}
          <nav className="topbar__guest" aria-label="Для гостя">
            <Link to="/journey" className="button" aria-label="Путь переезда"><Route className="icon-sm" aria-hidden />Путь</Link>
            <button type="button" aria-label="Вопросы" onClick={() => setFaq(true)}><CircleHelp className="icon-sm" aria-hidden />Вопросы</button>
          </nav>
        </header>
        <main className="container">
          <Outlet />
        </main>
      </>

      {notice ? <div className="toast" role="alert">{notice}</div> : null}
      {faq ? <FaqModal onClose={() => setFaq(false)} /> : null}
    </div>
  )
}
