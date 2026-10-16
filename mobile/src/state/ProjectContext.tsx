import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadProjects, saveProjects, type ProjectsState, type SavedProject } from "../storage/projects";

interface ProjectContextValue extends ProjectsState {
  ready: boolean;
  add: (project: SavedProject) => void;
  select: (id: string) => void;
  remove: (id: string) => void;
}

const Ctx = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProjectsState>({ projects: [], currentId: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadProjects().then((s) => {
      setState(s);
      setReady(true);
    });
  }, []);

  const update = useCallback((next: ProjectsState) => {
    setState(next);
    void saveProjects(next);
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      ...state,
      ready,
      add: (project) =>
        update({
          projects: [...state.projects.filter((p) => p.id !== project.id), project],
          currentId: project.id,
        }),
      select: (id) => update({ ...state, currentId: id }),
      remove: (id) => {
        const projects = state.projects.filter((p) => p.id !== id);
        update({ projects, currentId: state.currentId === id ? (projects[0]?.id ?? null) : state.currentId });
      },
    }),
    [state, ready, update],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjects(): ProjectContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProjects вызван вне ProjectProvider");
  return v;
}
