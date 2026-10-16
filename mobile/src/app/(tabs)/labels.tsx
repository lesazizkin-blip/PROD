import { useProjects } from "../../state/ProjectContext";
import { NoProject } from "../../ui/NoProject";
import { Placeholder } from "../../ui/Placeholder";

export default function LabelsScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return (
    <Placeholder
      title="Этикетки"
      note="QR-этикетка, печать и PDF, показ на экране телефона, сканер QR (роль E, API: /label, /labels)."
    />
  );
}
