import { useProjects } from "../../state/ProjectContext";
import { NoProject } from "../../ui/NoProject";
import { Placeholder } from "../../ui/Placeholder";

export default function ProgressScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return (
    <Placeholder
      title="Прогресс"
      note="Счётчики по статусам, погрузка и распаковка по комнатам, чек-лист первого дня (роль D, API: /progress, /first-day)."
    />
  );
}
