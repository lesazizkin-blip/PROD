import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import FaqModal from './FaqModal'
import BrandMark from './BrandMark'

/** Public pages have their own header; project navigation appears after signing in. */
export default function GuestShell() {
  const [faq, setFaq] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="public-shell">
        <header className="public-header">
          <Link to="/about" className="brand" aria-label="MoverMate: о нас"><BrandMark /><span>MoverMate</span></Link>
          <nav className="row" aria-label="Информация и вход">
            <Link to="/journey" className="public-tool-link">Путь переезда</Link>
            <Link to="/calculator" className="public-tool-link">Калькулятор</Link>
            <button className="link" aria-label="Вопросы" onClick={() => setFaq(true)}><CircleHelp className="icon-sm" aria-hidden /><span className="public-faq-label">Вопросы</span></button>
            {pathname !== '/auth' ? <Link to="/auth" className="button small">Войти</Link> : null}
          </nav>
        </header>
        <main className="public-content">
          <Outlet />
        </main>
      {faq ? <FaqModal onClose={() => setFaq(false)} /> : null}
    </div>
  )
}
