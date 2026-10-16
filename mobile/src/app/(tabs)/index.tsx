import { useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { Button, Checkbox, Dialog, FAB, HelperText, List, Portal, SegmentedButtons, Text, TextInput } from "react-native-paper";
import { api } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import type { Project, Stage, Task } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { confirmDelete } from "../../ui/confirm";
import { STAGES, STAGE_LABELS, formatDate } from "../../ui/format";
import { HealthBadge } from "../../ui/HealthBadge";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";

export default function PlanScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <Plan pid={currentId} />;
}

function Plan({ pid }: { pid: string }) {
  const project = useAsync<Project>(() => api.getProject(pid), [pid]);
  const tasks = useAsync<Task[]>(() => api.tasks(pid), [pid]);
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useFocusReload(tasks.reload);

  async function toggle(task: Task) {
    setActionError(null);
    try {
      await api.updateTask(pid, task.id, { done: !task.done });
      tasks.reload();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function remove(task: Task) {
    confirmDelete("Удалить задачу?", task.title, async () => {
      try {
        await api.deleteTask(pid, task.id);
        tasks.reload();
      } catch (e) {
        setActionError(errorMessage(e));
      }
    });
  }

  const list = tasks.data ?? [];
  const sections = STAGES.map((stage) => ({ stage, data: list.filter((t) => t.stage === stage) })).filter((s) => s.data.length > 0);
  const done = list.filter((t) => t.done).length;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text variant="titleLarge">{project.data?.name ?? "…"}</Text>
        <Text variant="bodyMedium">
          {project.data ? `Переезд ${formatDate(project.data.move_date)} · выполнено ${done} из ${list.length}` : " "}
        </Text>
        <View style={styles.badge}>
          <HealthBadge />
        </View>
        <HelperText type="error" visible={!!actionError}>{actionError}</HelperText>
      </View>
      <StateView loading={tasks.loading && !tasks.data} error={tasks.error} empty={list.length === 0} emptyText="Задач пока нет" onRetry={tasks.reload}>
        <SectionList
          sections={sections}
          keyExtractor={(t) => String(t.id)}
          renderSectionHeader={({ section }) => (
            <Text variant="titleSmall" style={styles.section}>{STAGE_LABELS[section.stage]}</Text>
          )}
          renderItem={({ item }) => (
            <List.Item
              title={item.title}
              titleStyle={item.done ? styles.done : undefined}
              description={[item.due_date ? `до ${formatDate(item.due_date)}` : null, item.assignee].filter(Boolean).join(" · ") || undefined}
              left={() => <Checkbox status={item.done ? "checked" : "unchecked"} onPress={() => toggle(item)} />}
              onPress={() => toggle(item)}
              onLongPress={() => remove(item)}
            />
          )}
          contentContainerStyle={styles.list}
        />
      </StateView>
      <FAB icon="plus" label="Задача" style={styles.fab} onPress={() => setAdding(true)} />
      <AddTaskDialog
        visible={adding}
        onDismiss={() => setAdding(false)}
        onSave={async (stage, title, assignee) => {
          await api.createTask(pid, { stage, title, assignee: assignee || null });
          setAdding(false);
          tasks.reload();
        }}
      />
    </View>
  );
}

function AddTaskDialog({
  visible,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSave: (stage: Stage, title: string, assignee: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [stage, setStage] = useState<Stage>("before");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(stage, title.trim(), assignee.trim());
      setTitle("");
      setAssignee("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Новая задача</Dialog.Title>
        <Dialog.Content style={styles.dialog}>
          <TextInput label="Что сделать" value={title} onChangeText={setTitle} mode="outlined" maxLength={200} autoFocus />
          <TextInput label="Ответственный (необязательно)" value={assignee} onChangeText={setAssignee} mode="outlined" maxLength={80} />
          <SegmentedButtons
            value={stage}
            onValueChange={(v) => setStage(v as Stage)}
            buttons={[
              { value: "before", label: "До" },
              { value: "moving_day", label: "День" },
              { value: "after", label: "После" },
            ]}
          />
          <HelperText type="error" visible={!!error}>{error}</HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Отмена</Button>
          <Button onPress={save} disabled={busy || !title.trim()} loading={busy}>Добавить</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { padding: 16, paddingBottom: 0, gap: 2 },
  badge: { alignItems: "flex-start", marginTop: 8 },
  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, opacity: 0.7 },
  list: { paddingBottom: 96 },
  done: { textDecorationLine: "line-through", opacity: 0.5 },
  fab: { position: "absolute", right: 16, bottom: 16 },
  dialog: { gap: 8 },
});
