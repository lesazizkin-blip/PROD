import { Route, Routes, useNavigate } from 'react-router-dom'
import NewProjectForm from './components/NewProjectForm'
import Shell from './components/Shell'
import Placeholder from './pages/Placeholder'

function NewProjectPage() {
  const navigate = useNavigate()
  return <NewProjectForm onDone={() => navigate('/')} />
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Placeholder title="План" />} />
        <Route path="boxes" element={<Placeholder title="Коробки" />} />
        <Route path="labels" element={<Placeholder title="Этикетки" />} />
        <Route path="progress" element={<Placeholder title="Прогресс" />} />
        <Route path="new" element={<NewProjectPage />} />
        <Route path="*" element={<Placeholder title="Страница не найдена" />} />
      </Route>
    </Routes>
  )
}
