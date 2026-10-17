import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/endpoints'
import { useAuth } from './AuthContext'
import { loadProjects, saveProjects, type ProjectsState, type SavedProject } from './projects'

interface ProjectContextValue extends ProjectsState {
  /** список с сервера уже загружен: до этого не показываем «создайте проект» */
  ready: boolean
  add: (project: SavedProject) => void
  select: (id: string) => void
  remove: (id: string) => void
  reload: () => Promise<void>
}

const Ctx = createContext<ProjectContextValue | null>(null)
const EMPTY: ProjectsState = { projects: [], currentId: null }

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [state, setState] = useState<ProjectsState>(loadProjects)
  // для какого пользователя список уже загружен: до этого проекты не показываем (в т.ч. прошлого пользователя)
  const [loadedFor, setLoadedFor] = useState<number | null>(null)

  const update = useCallback((next: ProjectsState) => {
    setState(next)
    saveProjects(next)
  }, [])

  // Список «моих проектов» берём с сервера; выбранный проект остаётся тем же, если он всё ещё доступен
  const reload = useCallback(async () => {
    const list = await api.myProjects()
    setState((prev) => {
      const projects = list.map((p) => ({ id: p.id, name: p.name, role: p.role, move_date: p.move_date }))
      const currentId = projects.some((p) => p.id === prev.currentId) ? prev.currentId : (projects[0]?.id ?? null)
      const next = { projects, currentId }
      saveProjects(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (user === null) saveProjects(EMPTY) // вышли: названия проектов на этом устройстве не остаются
    if (!user) return
    let cancelled = false
    // setState здесь асинхронный (после ответа сервера), а не синхронный в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
      .catch(() => {})
      .finally(() => !cancelled && setLoadedFor(user.id))
    return () => {
      cancelled = true
    }
  }, [user, reload])

  const ready = !!user && loadedFor === user.id
  const visible = ready ? state : EMPTY

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...visible,
      ready,
      reload,
      add: (project) => update({ projects: [...state.projects.filter((p) => p.id !== project.id), project], currentId: project.id }),
      select: (id) => update({ ...state, currentId: id }),
      remove: (id) => {
        const projects = state.projects.filter((p) => p.id !== id)
        update({ projects, currentId: state.currentId === id ? (projects[0]?.id ?? null) : state.currentId })
      },
    }),
    [visible, state, ready, reload, update],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjects(): ProjectContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProjects вызван вне ProjectProvider')
  return v
}
