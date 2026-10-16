import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { Banner, Button, Card, Chip, Dialog, FAB, HelperText, List, Portal, Searchbar, Switch, Text, TextInput } from "react-native-paper";
import { api } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import type { Box, Page, Reminder, SearchHit } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";
import { StatusChip } from "../../ui/StatusChip";

export default function BoxesScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <Boxes pid={currentId} />;
}

function Boxes({ pid }: { pid: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const q = query.trim();
  const boxes = useAsync<Page<Box>>(() => api.boxes(pid, { page_size: 200 }), [pid]);
  const hits = useAsync<Page<SearchHit> | null>(() => (q ? api.search(pid, q, { page_size: 100 }) : Promise.resolve(null)), [pid, q]);
  const reminders = useAsync<Reminder[]>(() => api.reminders(pid), [pid]);
  const [room, setRoom] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useFocusReload(() => {
    boxes.reload();
    hits.reload();
    reminders.reload();
  });
  const allBoxes = boxes.data?.items ?? [];
  const rooms = Array.from(new Set(allBoxes.map((b) => b.room))).sort();
  const visible = room ? allBoxes.filter((b) => b.room === room) : allBoxes;
  const waiting = reminders.data ?? [];

  const open = (n: number) => router.push({ pathname: "/projects/[pid]/boxes/[n]", params: { pid, n: String(n) } });

  return (
    <View style={styles.flex}>
      <Searchbar placeholder="Найти вещь или коробку" value={query} onChangeText={setQuery} style={styles.search} />
      {q ? (
        <StateView loading={hits.loading && !hits.data} error={hits.error} empty={(hits.data?.items.length ?? 0) === 0} emptyText={`«${q}» не найдено`} emptyIcon="magnify-close" onRetry={hits.reload}>
          <FlatList
            data={hits.data?.items ?? []}
            keyExtractor={(h) => String(h.item_id)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Card style={styles.card} onPress={() => open(item.box_number)}>
                <Card.Title
                  title={item.name}
                  subtitle={`Коробка № ${item.box_number} · ${item.room}`}
                  left={(p) => <List.Icon {...p} icon={item.lost ? "alert-circle-outline" : "magnify"} />}
                  right={() => <View style={styles.chip}><StatusChip status={item.status} /></View>}
                />
              </Card>
            )}
          />
        </StateView>
      ) : (
        <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={allBoxes.length === 0} emptyText="Коробок пока нет. Нажмите «Коробка», чтобы добавить." emptyIcon="package-variant" onRetry={boxes.reload}>
          {waiting.length > 0 ? (
            <Banner visible icon="clock-alert-outline" actions={[{ label: "Открыть", onPress: () => open(waiting[0].box.number) }]}>
              Ждут описи содержимого: {waiting.map((r) => `№${r.box.number}`).join(", ")}
            </Banner>
          ) : null}
          {rooms.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rooms} contentContainerStyle={styles.roomsContent}>
              <Chip selected={room === null} onPress={() => setRoom(null)}>Все</Chip>
              {rooms.map((r) => (
                <Chip key={r} selected={room === r} onPress={() => setRoom(room === r ? null : r)}>{r}</Chip>
              ))}
            </ScrollView>
          ) : null}
          <FlatList
            data={visible}
            keyExtractor={(b) => String(b.number)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Card style={styles.card} onPress={() => open(item.number)}>
                <Card.Title
                  title={`№ ${item.number} · ${item.room}`}
                  titleVariant="titleMedium"
                  subtitle={`${item.items_count} вещей${item.fill_later && item.items_count === 0 ? " · заполнить позже" : ""}`}
                  left={(p) => <List.Icon {...p} icon="package-variant-closed" />}
                  right={() => <View style={styles.chip}><StatusChip status={item.status} /></View>}
                />
              </Card>
            )}
          />
        </StateView>
      )}
      <FAB icon="plus" label="Коробка" style={styles.fab} onPress={() => setAdding(true)} />
      <AddBoxDialog
        visible={adding}
        onDismiss={() => setAdding(false)}
        onSave={async (room, text, later) => {
          const box = await api.createBox(pid, { room, items_text: text || null, fill_later: later });
          setAdding(false);
          boxes.reload();
          open(box.number);
        }}
      />
    </View>
  );
}

function AddBoxDialog({
  visible,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  onDismiss: () => void;
  onSave: (room: string, text: string, fillLater: boolean) => Promise<void>;
}) {
  const [room, setRoom] = useState("");
  const [text, setText] = useState("");
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave(room.trim(), text, later);
      setRoom("");
      setText("");
      setLater(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>Новая коробка</Dialog.Title>
        <Dialog.Content style={styles.dialog}>
          <TextInput label="Комната назначения" value={room} onChangeText={setRoom} mode="outlined" maxLength={60} autoFocus />
          <TextInput
            label="Содержимое (каждая вещь с новой строки)"
            value={text}
            onChangeText={setText}
            mode="outlined"
            multiline
            numberOfLines={4}
          />
          <View style={styles.row}>
            <Text style={styles.flex}>Заполнить позже</Text>
            <Switch value={later} onValueChange={setLater} />
          </View>
          <HelperText type="error" visible={!!error}>{error}</HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Отмена</Button>
          <Button onPress={save} disabled={busy || !room.trim()} loading={busy}>Создать</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { margin: 12 },
  rooms: { flexGrow: 0 },
  roomsContent: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  list: { paddingHorizontal: 12, paddingBottom: 110 },
  card: { marginBottom: 8 },
  chip: { marginRight: 12 },
  fab: { position: "absolute", right: 16, bottom: 16 },
  dialog: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center" },
});
