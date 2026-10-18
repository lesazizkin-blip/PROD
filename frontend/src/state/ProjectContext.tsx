import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/endpoints'
import { useAuth } from './AuthContext'
import { useLocalProjectArchive } from './localProjectArchive'
import { loadProjects, saveProjects, type ProjectsState, type SavedProject } from './projects'

interface ProjectContextValue extends ProjectsState {
  /** список с сервера уже загружен: до этого не показываем «создайте проект» */
  ready: boolean
  archivedIds: string[]
  archiveError: string | null
  archiveProject: (id: string, archived: boolean) => void
  add: (project: SavedProject) => void
  select: (id: string) => void
  remove: (id: string) => void
  reload: () => Promise<void>
}

const Ctx = createContext<ProjectContextValue | null>(null)
const EMPTY: ProjectsState = { projects: [], currentId: null }

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const archive = useLocalProjectArchive(user?.id ?? 0)
  const archiveIds = useRef(archive.ids)
  useEffect(() => { archiveIds.current = archive.ids }, [archive.ids])
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
      const projects = list.map((p) => ({ id: p.id, name: p.name, role: p.role, move_date: p.move_date, ...(p.move_date_end ? { move_date_end: p.move_date_end } : {}) }))
      const active = projects.filter(p => !archiveIds.current.includes(p.id))
      const currentId = active.some((p) => p.id === prev.currentId) ? prev.currentId : (active[0]?.id ?? null)
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
  const active = state.projects.filter(p => !archive.ids.includes(p.id))
  const currentId = active.some(p => p.id === state.currentId) ? state.currentId : active[0]?.id ?? null
  const visible = useMemo(() => ready ? { ...state, currentId } : EMPTY, [ready, state, currentId])

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...visible,
      ready,
      archivedIds: archive.ids,
      archiveError: archive.error,
      archiveProject: (id, archived) => {
        archive.archive(id, archived)
        const nextIds = archived ? [...archive.ids, id] : archive.ids.filter(value => value !== id)
        archiveIds.current = nextIds
        const remaining = state.projects.filter(p => !nextIds.includes(p.id))
        update({ ...state, currentId: remaining.some(p => p.id === currentId) ? currentId : remaining[0]?.id ?? null })
      },
      reload,
      add: (project) => update({ projects: [...state.projects.filter((p) => p.id !== project.id), project], currentId: project.id }),
      select: (id) => { if (state.projects.some(p => p.id === id) && !archive.ids.includes(id)) update({ ...state, currentId: id }) },
      remove: (id) => {
        const projects = state.projects.filter((p) => p.id !== id)
        update({ projects, currentId: currentId === id ? (projects.find(p => !archive.ids.includes(p.id))?.id ?? null) : currentId })
      },
    }),
    [visible, state, ready, reload, update, archive, currentId],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjects(): ProjectContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useProjects вызван вне ProjectProvider')
  return v
}
