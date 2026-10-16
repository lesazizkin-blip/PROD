import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, Chip, Dialog, FAB, HelperText, List, Portal, Searchbar, Switch, Text, TextInput } from "react-native-paper";
import { api } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import type { Box, Page, SearchHit } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { STATUS_LABELS } from "../../ui/format";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";

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
  const [adding, setAdding] = useState(false);
  useFocusReload(() => {
    boxes.reload();
    hits.reload();
  });

  const open = (n: number) => router.push({ pathname: "/projects/[pid]/boxes/[n]", params: { pid, n: String(n) } });

  return (
    <View style={styles.flex}>
      <Searchbar placeholder="Найти вещь или коробку №" value={query} onChangeText={setQuery} style={styles.search} />
      {q ? (
        <StateView loading={hits.loading && !hits.data} error={hits.error} empty={(hits.data?.items.length ?? 0) === 0} emptyText={`«${q}» не найдено`} onRetry={hits.reload}>
          <FlatList
            data={hits.data?.items ?? []}
            keyExtractor={(h) => String(h.item_id)}
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                description={`Коробка № ${item.box_number} · ${item.room} · ${STATUS_LABELS[item.status]}`}
                left={(p) => <List.Icon {...p} icon={item.lost ? "alert-circle-outline" : "magnify"} />}
                onPress={() => open(item.box_number)}
              />
            )}
          />
        </StateView>
      ) : (
        <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={(boxes.data?.items.length ?? 0) === 0} emptyText="Коробок пока нет. Нажмите «Коробка», чтобы добавить." onRetry={boxes.reload}>
          <FlatList
            data={boxes.data?.items ?? []}
            keyExtractor={(b) => String(b.number)}
            renderItem={({ item }) => (
              <List.Item
                title={`Коробка № ${item.number} · ${item.room}`}
                description={`${item.items_count} вещей${item.fill_later && item.items_count === 0 ? " · заполнить позже" : ""}`}
                left={(p) => <List.Icon {...p} icon="package-variant-closed" />}
                right={() => <Chip compact style={styles.chip}>{STATUS_LABELS[item.status]}</Chip>}
                onPress={() => open(item.number)}
              />
            )}
            contentContainerStyle={styles.list}
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
  list: { paddingBottom: 96 },
  chip: { alignSelf: "center" },
  fab: { position: "absolute", right: 16, bottom: 16 },
  dialog: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center" },
});
