import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import NewProjectForm from './components/NewProjectForm'
import GuestShell from './components/GuestShell'
import Shell from './components/Shell'
import AboutPage from './pages/AboutPage'
import BoxesPage from './pages/BoxesPage'
import BoxPage from './pages/BoxPage'
import LabelPage from './pages/LabelPage'
import LabelsPage from './pages/LabelsPage'
import AuthPage from './pages/AuthPage'
import InvitePage from './pages/InvitePage'
import PlanPage from './pages/PlanPage'
import PrintAllPage from './pages/PrintAllPage'
import ProfilePage from './pages/ProfilePage'
import ProgressPage from './pages/ProgressPage'
import TipsPage from './pages/TipsPage'
import { useAuth } from './state/AuthContext'

// Сканер (библиотека камеры тяжёлая) грузится только при открытии экрана
const ScanPage = lazy(async () => {
  const { default: Scanner } = await import('./pages/ScanPage')
  const resolveCode = import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false'
    ? (await import('./features/recognition/qr')).resolveCompactCode : undefined
  const recognizeHandwriting = import.meta.env.VITE_LOCAL_OCR_PROTOTYPE === 'true'
    ? (await import('./features/recognition/loadLocalOcr')).recognizeWithLocalPrototype : undefined
  return { default: () => <Scanner resolveCode={resolveCode} recognizeHandwriting={recognizeHandwriting} /> }
})

function NewProjectPage() {
  const navigate = useNavigate()
  return <NewProjectForm onDone={() => navigate('/')} />
}

function NotFound() {
  return <div className="state"><div className="state-icon">🧭</div><p>Страница не найдена</p><Link to="/">На главную</Link></div>
}

export default function App() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  if (user === undefined) return <div className="state" role="status"><span className="spinner" /> Загрузка…</div>
  if (user === null) {
    // ссылка из QR или приглашение: вход на месте, адрес не меняется - после входа откроется та же страница
    if (pathname.startsWith('/invite/') || pathname.startsWith('/projects/')) {
      const note = pathname.startsWith('/invite/')
        ? 'Вас пригласили в проект. Войдите или зарегистрируйтесь, чтобы присоединиться.'
        : 'Войдите, чтобы открыть коробку.'
      return <div className="workspace auth-page"><AuthPage note={note} /></div>
    }
    // гость попадает на страницу «О нас»; разделы просят сначала зарегистрироваться
    return (
      <Routes>
        <Route element={<GuestShell />}>
          <Route path="auth" element={<AuthPage />} />
          <Route path="*" element={<AboutPage />} />
        </Route>
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<PlanPage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="labels" element={<LabelsPage />} />
        <Route path="labels/print" element={<PrintAllPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="tips" element={<TipsPage />} />
        <Route path="scan" element={<Suspense fallback={<div className="state" role="status">Загрузка…</div>}><ScanPage /></Suspense>} />
        <Route path="new" element={<NewProjectPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="auth" element={<Navigate to="/" replace />} />
        <Route path="projects/:pid/boxes/:n" element={<BoxPage />} />
        <Route path="projects/:pid/boxes/:n/label" element={<LabelPage />} />
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
