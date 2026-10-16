import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  Button, Card, Checkbox, Dialog, FAB, HelperText, IconButton, List, Portal, ProgressBar, SegmentedButtons, Text, TextInput,
} from "react-native-paper";
import { api } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import type { FirstDayItem, Project, Stage, Task } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { confirmDelete } from "../../ui/confirm";
import { STAGES, STAGE_LABELS, formatDate } from "../../ui/format";
import { HealthBadge } from "../../ui/HealthBadge";
import { NoProject } from "../../ui/NoProject";
import { SectionTitle } from "../../ui/SectionTitle";
import { StateView } from "../../ui/StateView";

export default function PlanScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <Plan pid={currentId} />;
}

function Plan({ pid }: { pid: string }) {
  const router = useRouter();
  const { projects, select } = useProjects();
  const project = useAsync<Project>(() => api.getProject(pid), [pid]);
  const tasks = useAsync<Task[]>(() => api.tasks(pid), [pid]);
  const firstDay = useAsync<FirstDayItem[]>(() => api.firstDay(pid), [pid]);
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reloadAll = () => {
    project.reload();
    tasks.reload();
    firstDay.reload();
  };
  useFocusReload(reloadAll);

  async function act(action: () => Promise<unknown>) {
    setActionError(null);
    try {
      await action();
      reloadAll();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  const list = tasks.data ?? [];
  const done = list.filter((t) => t.done).length;
  const first = firstDay.data ?? [];

  return (
    <View style={styles.flex}>
      <StateView loading={tasks.loading && !tasks.data} error={tasks.error} onRetry={reloadAll}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={tasks.loading} onRefresh={reloadAll} />}
        >
          <Card mode="contained">
            <Card.Content style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.flex}>
                  <Text variant="titleLarge">{project.data?.name ?? "…"}</Text>
                  <Text variant="bodyMedium">{project.data ? `Переезд ${formatDate(project.data.move_date)}` : " "}</Text>
                </View>
                <IconButton icon="swap-horizontal" onPress={() => setSwitching(true)} accessibilityLabel="Сменить проект" />
              </View>
              <ProgressBar progress={list.length ? done / list.length : 0} />
              <Text variant="bodySmall">Выполнено {done} из {list.length}</Text>
              <View style={styles.row}>
                <HealthBadge />
                <Button icon="lightbulb-on-outline" compact onPress={() => router.push("/tips")}>Памятки</Button>
              </View>
            </Card.Content>
          </Card>
          <HelperText type="error" visible={!!actionError}>{actionError}</HelperText>

          {STAGES.map((stage) => {
            const items = list.filter((t) => t.stage === stage);
            if (items.length === 0) return null;
            return (
              <View key={stage}>
                <SectionTitle>{STAGE_LABELS[stage]}</SectionTitle>
                <Card>
                  {items.map((t) => (
                    <List.Item
                      key={t.id}
                      title={t.title}
                      titleNumberOfLines={3}
                      titleStyle={t.done ? styles.done : undefined}
                      description={[t.due_date ? `до ${formatDate(t.due_date)}` : null, t.assignee].filter(Boolean).join(" · ") || undefined}
                      left={() => <Checkbox status={t.done ? "checked" : "unchecked"} onPress={() => act(() => api.updateTask(pid, t.id, { done: !t.done }))} />}
                      onPress={() => act(() => api.updateTask(pid, t.id, { done: !t.done }))}
                      onLongPress={() => confirmDelete("Удалить задачу?", t.title, () => act(() => api.deleteTask(pid, t.id)))}
                    />
                  ))}
                </Card>
              </View>
            );
          })}

          <SectionTitle>Коробка первого дня</SectionTitle>
          <Card>
            {first.length === 0 ? <List.Item title="Список пуст" /> : null}
            {first.map((f) => (
              <List.Item
                key={f.id}
                title={f.title}
                titleStyle={f.done ? styles.done : undefined}
                left={() => <Checkbox status={f.done ? "checked" : "unchecked"} onPress={() => act(() => api.updateFirstDay(pid, f.id, { done: !f.done }))} />}
                onPress={() => act(() => api.updateFirstDay(pid, f.id, { done: !f.done }))}
                onLongPress={() => confirmDelete("Удалить пункт?", f.title, () => act(() => api.deleteFirstDay(pid, f.id)))}
              />
            ))}
          </Card>
          <Text variant="bodySmall" style={styles.hint}>Нажмите, чтобы отметить. Долгое нажатие удаляет.</Text>
        </ScrollView>
      </StateView>

      <FAB icon="plus" label="Задача" style={styles.fab} onPress={() => setAdding(true)} />
      <AddTaskDialog
        visible={adding}
        onDismiss={() => setAdding(false)}
        onSave={async (stage, title, assignee) => {
          await api.createTask(pid, { stage, title, assignee: assignee || null });
          setAdding(false);
          reloadAll();
        }}
      />

      <Portal>
        <Dialog visible={switching} onDismiss={() => setSwitching(false)}>
          <Dialog.Title>Проекты</Dialog.Title>
          <Dialog.Content>
            {projects.map((p) => (
              <List.Item
                key={p.id}
                title={p.name}
                left={(props) => <List.Icon {...props} icon={p.id === pid ? "check-circle" : "circle-outline"} />}
                onPress={() => {
                  select(p.id);
                  setSwitching(false);
                }}
              />
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSwitching(false)}>Закрыть</Button>
            <Button
              icon="plus"
              onPress={() => {
                setSwitching(false);
                router.push("/new-project");
              }}
            >
              Новый проект
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  content: { padding: 16, paddingBottom: 110 },
  hero: { gap: 10 },
  heroTop: { flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  done: { textDecorationLine: "line-through", opacity: 0.5 },
  hint: { opacity: 0.6, marginTop: 8, textAlign: "center" },
  fab: { position: "absolute", right: 16, bottom: 16 },
  dialog: { gap: 8 },
});
