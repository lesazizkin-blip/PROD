// Список «моих проектов» приходит с сервера после входа; здесь его копия и выбранный проект,
// чтобы после обновления страницы открылся тот же проект.
const KEY = 'movermate.projects.v1'

export interface SavedProject {
  id: string
  name: string
  role?: 'owner' | 'member'
}

export interface ProjectsState {
  projects: SavedProject[]
  currentId: string | null
}

const EMPTY: ProjectsState = { projects: [], currentId: null }

// localStorage бывает недоступен (приватный режим, запрет сайта): тогда работаем без запоминания
export function loadProjects(): ProjectsState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<ProjectsState>
    if (!Array.isArray(parsed.projects)) return EMPTY
    const projects = parsed.projects.filter((p): p is SavedProject => typeof p?.id === 'string' && typeof p?.name === 'string')
    const currentId = projects.some((p) => p.id === parsed.currentId) ? (parsed.currentId as string) : (projects[0]?.id ?? null)
    return { projects, currentId }
  } catch {
    return EMPTY
  }
}

export function saveProjects(state: ProjectsState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* состояние останется в памяти до перезагрузки */
  }
}
