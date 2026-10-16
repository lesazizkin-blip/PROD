import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { loadProjects, saveProjects, type ProjectsState, type SavedProject } from './projects'

interface ProjectContextValue extends ProjectsState {
  add: (project: SavedProject) => void
  select: (id: string) => void
  remove: (id: string) => void
}

const Ctx = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectsState>(loadProjects)

  const update = useCallback((next: ProjectsState) => {
    setState(next)
    saveProjects(next)
  }, [])

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...state,
      add: (project) => update({ projects: [...state.projects.filter((p) => p.id !== project.id), project], currentId: project.id }),
      select: (id) => update({ ...state, currentId: id }),
      remove: (id) => {
        const projects = state.projects.filter((p) => p.id !== id)
        update({ projects, currentId: state.currentId === id ? (projects[0]?.id ?? null) : state.currentId })
      },
    }),
    [state, update],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjects(): ProjectContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProjects вызван вне ProjectProvider')
  return v
}
