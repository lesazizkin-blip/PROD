import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Dialog, HelperText, List, Portal, ProgressBar, Text } from "react-native-paper";
import { api } from "../../api/endpoints";
import { errorMessage } from "../../api/client";
import type { BoxStatus, Hint, LostItem, Progress, RoomProgress } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { STATUS_COLORS } from "../../theme";
import { STATUS_LABELS } from "../../ui/format";
import { NoProject } from "../../ui/NoProject";
import { SectionTitle } from "../../ui/SectionTitle";
import { StateView } from "../../ui/StateView";
import { StatusChip } from "../../ui/StatusChip";

const STATUSES: BoxStatus[] = ["packing", "packed", "loaded", "delivered", "unpacked"];

// Для комнаты: какие коробки можно сдвинуть дальше одной кнопкой (чек-лист погрузки, доставка, распаковка)
const ROOM_STEPS: { from: BoxStatus; to: BoxStatus; label: string; icon: string }[] = [
  { from: "packed", to: "loaded", label: "Погрузить", icon: "truck-fast-outline" },
  { from: "loaded", to: "delivered", label: "Доставлено", icon: "home-import-outline" },
  { from: "delivered", to: "unpacked", label: "Распаковано", icon: "check-circle-outline" },
];

const REASONS: Record<string, string> = {
  recorded: "записана в этой коробке",
  similar_content: "лежит похожее",
  same_room: "та же комната",
};

export default function ProgressScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <ProgressView pid={currentId} />;
}

function ProgressView({ pid }: { pid: string }) {
  const router = useRouter();
  const progress = useAsync<Progress>(() => api.progress(pid), [pid]);
  const lost = useAsync<LostItem[]>(() => api.lostItems(pid), [pid]);
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<{ name: string; list: Hint[] } | null>(null);

  const reloadAll = () => {
    progress.reload();
    lost.reload();
  };
  useFocusReload(reloadAll);

  async function moveRoom(room: string, from: BoxStatus, to: BoxStatus) {
    setError(null);
    try {
      const boxes = await api.boxes(pid, { room, status: from, page_size: 200 });
      await api.bulkTransition(pid, boxes.items.map((b) => b.number), to);
      reloadAll();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function showHints(entry: LostItem) {
    setError(null);
    try {
      setHints({ name: entry.item.name, list: await api.hints(pid, entry.item.id) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const p = progress.data;
  const lostList = lost.data ?? [];
  const openBox = (n: number) => {
    setHints(null);
    router.push({ pathname: "/projects/[pid]/boxes/[n]", params: { pid, n: String(n) } });
  };

  return (
    <StateView loading={progress.loading && !p} error={progress.error} empty={!!p && p.boxes_total === 0} emptyText="Коробок пока нет: прогресс появится после первой коробки" emptyIcon="chart-donut" onRetry={reloadAll}>
      {p ? (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={progress.loading} onRefresh={reloadAll} />}>
          <Card mode="contained">
            <Card.Content style={styles.hero}>
              <Text variant="displaySmall">{p.boxes_total}</Text>
              <Text variant="bodyMedium">коробок · распаковано {Math.round(p.unpacked_percent)}%</Text>
              <ProgressBar progress={p.unpacked_percent / 100} color={STATUS_COLORS.unpacked} />
            </Card.Content>
          </Card>
          <HelperText type="error" visible={!!error}>{error}</HelperText>

          <View style={styles.grid}>
            {STATUSES.map((s) => (
              <Card key={s} style={[styles.cell, { borderLeftColor: STATUS_COLORS[s], borderLeftWidth: 4 }]}>
                <Card.Content>
                  <Text variant="headlineSmall">{p.by_status[s]}</Text>
                  <Text variant="bodySmall">{STATUS_LABELS[s]}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>

          <SectionTitle>По комнатам</SectionTitle>
          {p.rooms.map((r: RoomProgress) => (
            <Card key={r.room} style={styles.room}>
              <Card.Content style={styles.roomBody}>
                <Text variant="titleMedium">{r.room} · {r.total} кор.</Text>
                <Text variant="bodySmall">Погружено {r.loaded} из {r.total}</Text>
                <ProgressBar progress={r.loaded_percent / 100} color={STATUS_COLORS.loaded} />
                <Text variant="bodySmall">Распаковано {r.unpacked} из {r.total}</Text>
                <ProgressBar progress={r.unpacked_percent / 100} color={STATUS_COLORS.unpacked} />
                <View style={styles.steps}>
                  {ROOM_STEPS.filter((step) => r.by_status[step.from] > 0).map((step) => (
                    <Button key={step.to} compact mode="contained-tonal" icon={step.icon} onPress={() => moveRoom(r.room, step.from, step.to)}>
                      {step.label} ({r.by_status[step.from]})
                    </Button>
                  ))}
                </View>
              </Card.Content>
            </Card>
          ))}

          <SectionTitle>Потерянные вещи</SectionTitle>
          <Card>
            {lostList.length === 0 ? <List.Item title="Ничего не потеряно" left={(props) => <List.Icon {...props} icon="check" />} /> : null}
            {lostList.map((entry) => (
              <List.Item
                key={entry.item.id}
                title={entry.item.name}
                description={`Коробка № ${entry.box_number} · ${entry.room}`}
                left={(props) => <List.Icon {...props} icon="alert-circle" color="#B3261E" />}
                right={() => <Button compact onPress={() => showHints(entry)}>Где искать</Button>}
              />
            ))}
          </Card>
          <Text variant="bodySmall" style={styles.hint}>Пометить вещь потерянной можно в карточке коробки.</Text>
        </ScrollView>
      ) : null}

      <Portal>
        <Dialog visible={!!hints} onDismiss={() => setHints(null)}>
          <Dialog.Title>Где искать: {hints?.name}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView>
              {hints?.list.length === 0 ? <Text style={styles.hint}>Подходящих нераспакованных коробок нет.</Text> : null}
              {hints?.list.map((h) => (
                <List.Item
                  key={h.box_number}
                  title={`Коробка № ${h.box_number} · ${h.room}`}
                  description={REASONS[h.reason] ?? h.reason}
                  right={() => <View style={styles.chipBox}><StatusChip status={h.status} /></View>}
                  onPress={() => openBox(h.box_number)}
                />
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setHints(null)}>Закрыть</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </StateView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  hero: { gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "48%", flexGrow: 1 },
  room: { marginBottom: 8 },
  roomBody: { gap: 6 },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  hint: { opacity: 0.6, marginTop: 8, textAlign: "center" },
  chipBox: { alignSelf: "center" },
});
