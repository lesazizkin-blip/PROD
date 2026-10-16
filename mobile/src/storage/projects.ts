import AsyncStorage from "@react-native-async-storage/async-storage";

// Список «моих проектов» хранится только на устройстве: на сервере списка проектов нет (приватность).
const KEY = "movermate.projects.v1";

export interface SavedProject {
  id: string;
  name: string;
}

export interface ProjectsState {
  projects: SavedProject[];
  currentId: string | null;
}

const EMPTY: ProjectsState = { projects: [], currentId: null };

export async function loadProjects(): Promise<ProjectsState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as ProjectsState;
    if (!Array.isArray(parsed.projects)) return EMPTY;
    return { projects: parsed.projects, currentId: parsed.currentId ?? parsed.projects[0]?.id ?? null };
  } catch {
    return EMPTY;
  }
}

export async function saveProjects(state: ProjectsState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // сбой записи не должен ронять приложение: состояние останется в памяти до перезапуска
  }
}
