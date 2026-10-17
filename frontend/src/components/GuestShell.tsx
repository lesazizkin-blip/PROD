import { useRef, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import FaqModal from './FaqModal'
import { NAV_TABS } from './navTabs'

/** Каркас для гостя: те же разделы слева, но вместо перехода - уведомление, что сначала нужна регистрация. */
export default function GuestShell() {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const [faq, setFaq] = useState(false)

  const needAccount = (section: string) => {
    setNotice(`Раздел «${section}» доступен после регистрации. Зарегистрируйтесь или войдите, чтобы пользоваться MoverMate.`)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/about" className="brand" aria-label="MoverMate: о нас">
          <img src="/assets/box-mark.svg" width="36" height="36" alt="" />
          <span>MoverMate</span>
        </Link>
        <p className="brand-caption">УЧЁТ ВЕЩЕЙ<br />И ПЛАН ПЕРЕЕЗДА</p>
        <nav className="tabs" aria-label="Разделы">
          {NAV_TABS.map((t) => (
            <button key={t.label} type="button" className="tab" onClick={() => needAccount(t.label)}>
              <t.icon className="icon" aria-hidden />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="guest-faq">
          <button type="button" className="sidebar__me sidebar__faq" onClick={() => setFaq(true)}>
            <CircleHelp className="icon" aria-hidden />
            <span className="sidebar__name">Вопросы</span>
          </button>
        </div>
      </aside>

      <>
        <header className="topbar">
          <Link to="/about" className="topbar__brand" aria-label="MoverMate: о нас"><img src="/assets/box-mark.svg" width="36" height="36" alt="" /></Link>
          <span className="breadcrumb">MoverMate</span>
          <div className="topbar__actions">
            <Link to="/auth" className="button small">Войти</Link>
          </div>
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
