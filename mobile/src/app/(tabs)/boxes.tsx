import { useProjects } from "../../state/ProjectContext";
import { NoProject } from "../../ui/NoProject";
import { Placeholder } from "../../ui/Placeholder";

export default function BoxesScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return (
    <Placeholder
      title="Коробки и поиск"
      note="Список коробок, быстрый ввод содержимого, статусы и поиск вещей (роль E, API: /boxes, /search)."
    />
  );
}
