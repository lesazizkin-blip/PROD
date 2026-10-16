import { Route, Routes, useNavigate } from 'react-router-dom'
import NewProjectForm from './components/NewProjectForm'
import Shell from './components/Shell'
import BoxesPage from './pages/BoxesPage'
import BoxPage from './pages/BoxPage'
import LabelPage from './pages/LabelPage'
import LabelsPage from './pages/LabelsPage'
import PlanPage from './pages/PlanPage'
import PrintAllPage from './pages/PrintAllPage'
import ProgressPage from './pages/ProgressPage'
import ScanPage from './pages/ScanPage'
import TipsPage from './pages/TipsPage'

function NewProjectPage() {
  const navigate = useNavigate()
  return <NewProjectForm onDone={() => navigate('/')} />
}

function NotFound() {
  return <div className="state"><div className="state-icon">🧭</div><p>Страница не найдена</p></div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<PlanPage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="labels" element={<LabelsPage />} />
        <Route path="labels/print" element={<PrintAllPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="tips" element={<TipsPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="new" element={<NewProjectPage />} />
        <Route path="projects/:pid/boxes/:n" element={<BoxPage />} />
        <Route path="projects/:pid/boxes/:n/label" element={<LabelPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
