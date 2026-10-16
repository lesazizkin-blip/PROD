import type { ReactNode } from 'react'
import { useProjects } from '../state/ProjectContext'
import NewProjectForm from './NewProjectForm'

/** Страницы проекта: пока проект не выбран, показываем создание нового. */
export default function RequireProject({ children }: { children: (pid: string) => ReactNode }) {
  const { currentId } = useProjects()
  return currentId ? <>{children(currentId)}</> : <NewProjectForm />
}
