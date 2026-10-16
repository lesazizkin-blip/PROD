import { FlatList, StyleSheet, View } from "react-native";
import { Checkbox, List, Text } from "react-native-paper";
import { api } from "../../api/endpoints";
import type { Stage, Task } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { HealthBadge } from "../../ui/HealthBadge";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";

const STAGE_TITLES: Record<Stage, string> = {
  before: "До переезда",
  moving_day: "День переезда",
  after: "После переезда",
};

export default function PlanScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <PlanTasks pid={currentId} />;
}

// Каркас: показывает задачи из API. Свои задачи, срок и отметки — следующий шаг (роль D).
function PlanTasks({ pid }: { pid: string }) {
  const { data, loading, error, reload } = useAsync(() => api.tasks(pid), [pid]);
  const tasks: Task[] = data ?? [];
  return (
    <View style={styles.flex}>
      <View style={styles.badge}>
        <HealthBadge />
      </View>
      <StateView loading={loading} error={error} empty={tasks.length === 0} emptyText="Задач пока нет" onRetry={reload}>
        <FlatList
          data={tasks}
          keyExtractor={(t) => String(t.id)}
          ListHeaderComponent={<Text variant="titleMedium" style={styles.header}>План переезда</Text>}
          renderItem={({ item }) => (
            <List.Item
              title={item.title}
              description={`${STAGE_TITLES[item.stage]}${item.due_date ? ` · до ${item.due_date}` : ""}${item.assignee ? ` · ${item.assignee}` : ""}`}
              left={() => <Checkbox status={item.done ? "checked" : "unchecked"} disabled />}
            />
          )}
        />
      </StateView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  badge: { padding: 12, alignItems: "flex-start" },
  header: { paddingHorizontal: 16, paddingBottom: 4 },
});
