import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Card, ProgressBar, Text } from "react-native-paper";
import { api } from "../../api/endpoints";
import type { BoxStatus, Progress } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { STATUS_LABELS } from "../../ui/format";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";

const STATUSES: BoxStatus[] = ["packing", "packed", "loaded", "delivered", "unpacked"];

export default function ProgressScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <ProgressView pid={currentId} />;
}

function ProgressView({ pid }: { pid: string }) {
  const progress = useAsync<Progress>(() => api.progress(pid), [pid]);
  useFocusReload(progress.reload);
  const p = progress.data;
  return (
    <StateView loading={progress.loading && !p} error={progress.error} empty={!!p && p.boxes_total === 0} emptyText="Коробок пока нет: прогресс появится после первой коробки" onRetry={progress.reload}>
      {p ? (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={progress.loading} onRefresh={progress.reload} />}>
          <Text variant="titleMedium">Коробок всего: {p.boxes_total}</Text>
          <View style={styles.grid}>
            {STATUSES.map((s) => (
              <Card key={s} style={styles.cell}>
                <Card.Content>
                  <Text variant="headlineMedium">{p.by_status[s]}</Text>
                  <Text variant="bodySmall">{STATUS_LABELS[s]}</Text>
                </Card.Content>
              </Card>
            ))}
          </View>
          <Text variant="titleMedium" style={styles.title}>По комнатам</Text>
          {p.rooms.map((r) => (
            <Card key={r.room} style={styles.room}>
              <Card.Content style={styles.roomBody}>
                <Text variant="titleSmall">{r.room} · {r.total} кор.</Text>
                <Text variant="bodySmall">Погружено {r.loaded} из {r.total}</Text>
                <ProgressBar progress={r.loaded_percent / 100} />
                <Text variant="bodySmall">Распаковано {r.unpacked} из {r.total} ({Math.round(r.unpacked_percent)}%)</Text>
                <ProgressBar progress={r.unpacked_percent / 100} />
              </Card.Content>
            </Card>
          ))}
          <Text variant="bodySmall" style={styles.title}>Коробок с описью содержимого: {Math.round(p.coverage * 100)}%</Text>
        </ScrollView>
      ) : null}
    </StateView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "31%", flexGrow: 1 },
  title: { marginTop: 12 },
  room: { marginTop: 4 },
  roomBody: { gap: 6 },
});
