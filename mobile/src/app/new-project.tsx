import { useRouter } from "expo-router";
import { NoProject } from "../ui/NoProject";

export default function NewProjectScreen() {
  const router = useRouter();
  return <NoProject onDone={() => router.back()} />;
}
