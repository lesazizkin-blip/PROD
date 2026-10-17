import { useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import BrandMark from './BrandMark'
import { NAV_TABS } from './navTabs'

/** Каркас для гостя: те же разделы слева, но вместо перехода - уведомление, что сначала нужна регистрация. */
export default function GuestShell() {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const needAccount = (section: string) => {
    setNotice(`Раздел «${section}» доступен после регистрации. Зарегистрируйтесь или войдите, чтобы пользоваться MoverMate.`)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/about" className="sidebar__brand" aria-label="MoverMate: о нас">
          <BrandMark />
          <span>MoverMate</span>
        </Link>
        <nav className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t) => (
            <button key={t.label} type="button" className="tab" onClick={() => needAccount(t.label)}>
              <t.icon className="icon" aria-hidden />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <Link to="/about" className="topbar__brand" aria-label="MoverMate: о нас"><BrandMark /></Link>
          <span className="crumbs">MoverMate</span>
          <div className="topbar__actions">
            <Link to="/auth" className="button small">Войти</Link>
          </div>
        </header>
        <main className="container">
          <Outlet />
        </main>
      </div>

      {notice ? <div className="toast" role="alert">{notice}</div> : null}
    </div>
  )
}
