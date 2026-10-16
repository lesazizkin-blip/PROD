import type { ReactNode } from 'react'
import { useProjects } from '../state/ProjectContext'
import NewProjectForm from './NewProjectForm'

/** Страницы проекта: пока список грузится - ждём, если проектов нет - предлагаем создать. */
export default function RequireProject({ children }: { children: (pid: string) => ReactNode }) {
  const { currentId, ready } = useProjects()
  if (currentId) return <>{children(currentId)}</>
  if (!ready) return <div className="state" role="status"><span className="spinner" /> Загрузка…</div>
  return <NewProjectForm />
}
