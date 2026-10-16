import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Chip, Dialog, HelperText, IconButton, List, Portal, Text, TextInput } from "react-native-paper";
import { api } from "../../../../../api/endpoints";
import { errorMessage } from "../../../../../api/client";
import type { BoxCard } from "../../../../../api/types";
import { useAsync } from "../../../../../state/useAsync";
import { confirmDelete } from "../../../../../ui/confirm";
import { STATUS_LABELS, nextStatus, prevStatus } from "../../../../../ui/format";
import { StatusChip } from "../../../../../ui/StatusChip";
import { StateView } from "../../../../../ui/StateView";

// Карточка коробки. Сюда ведёт QR: movermate://projects/{pid}/boxes/{n} (открытие только читает, дублей не создаёт).
export default function BoxCardScreen() {
  const { pid, n } = useLocalSearchParams<{ pid: string; n: string }>();
  const router = useRouter();
  const number = Number(n);
  const valid = !!pid && Number.isInteger(number) && number >= 1;
  const card = useAsync<BoxCard>(
    () => (valid ? api.getBox(pid, number) : Promise.reject(new Error("Некорректная ссылка на коробку"))),
    [pid, number],
  );
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      card.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const box = card.data;
  const next = box ? nextStatus(box.status) : null;
  const prev = box ? prevStatus(box.status) : null;

  return (
    <StateView loading={card.loading && !box} error={card.error} onRetry={card.reload}>
      {box ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="displaySmall">№ {box.number}</Text>
          <Text variant="titleLarge">{box.room}</Text>
          <View style={styles.row}>
            <StatusChip status={box.status} />
            {box.fill_later && box.items.length === 0 ? <Chip icon="clock-outline">Заполнить позже</Chip> : null}
          </View>

          <View style={styles.row}>
            {prev ? (
              <Button mode="outlined" icon="undo" onPress={() => run(() => api.transition(pid, number, prev))}>
                {STATUS_LABELS[prev]}
              </Button>
            ) : null}
            {next ? (
              <Button mode="contained" icon="arrow-right" onPress={() => run(() => api.transition(pid, number, next))}>
                {STATUS_LABELS[next]}
              </Button>
            ) : null}
          </View>
          <HelperText type="error" visible={!!error}>{error}</HelperText>

          <View style={styles.row}>
            <Button icon="qrcode" mode="contained-tonal" onPress={() => router.push({ pathname: "/projects/[pid]/boxes/[n]/label", params: { pid, n: String(number) } })}>
              Этикетка
            </Button>
            <Button icon="plus" mode="contained-tonal" onPress={() => setAdding(true)}>Вещи</Button>
          </View>

          <Text variant="titleMedium" style={styles.title}>Содержимое ({box.items.length})</Text>
          {box.items.length === 0 ? <Text style={styles.empty}>Пока пусто. Добавьте вещи кнопкой «Вещи».</Text> : null}
          {box.items.map((item) => (
            <List.Item
              key={item.id}
              title={item.name}
              description={item.lost ? "Потеряна: ищите в нераспакованных коробках" : undefined}
              left={(p) => <List.Icon {...p} icon={item.lost ? "alert-circle" : "circle-small"} />}
              right={() => (
                <View style={styles.row}>
                  <IconButton icon={item.lost ? "check" : "alert-circle-outline"} onPress={() => run(() => api.updateItem(pid, item.id, { lost: !item.lost }))} />
                  <IconButton icon="delete-outline" onPress={() => confirmDelete("Удалить вещь?", item.name, () => run(() => api.deleteItem(pid, item.id)))} />
                </View>
              )}
            />
          ))}

          <Button
            icon="delete"
            textColor="#B3261E"
            style={styles.title}
            onPress={() =>
              confirmDelete("Удалить коробку?", `Коробка № ${box.number} и её содержимое будут удалены.`, async () => {
                try {
                  await api.deleteBox(pid, number);
                  router.back();
                } catch (e) {
                  setError(errorMessage(e));
                }
              })
            }
          >
            Удалить коробку
          </Button>

          <Portal>
            <Dialog visible={adding} onDismiss={() => setAdding(false)}>
              <Dialog.Title>Добавить вещи</Dialog.Title>
              <Dialog.Content>
                <TextInput label="Каждая вещь с новой строки" value={text} onChangeText={setText} mode="outlined" multiline numberOfLines={5} autoFocus />
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setAdding(false)}>Отмена</Button>
                <Button
                  disabled={!text.trim()}
                  onPress={async () => {
                    await run(() => api.createItemsBulk(pid, number, text));
                    setText("");
                    setAdding(false);
                  }}
                >
                  Добавить
                </Button>
              </Dialog.Actions>
            </Dialog>
          </Portal>
        </ScrollView>
      ) : null}
    </StateView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  title: { marginTop: 16 },
  empty: { opacity: 0.6 },
});
