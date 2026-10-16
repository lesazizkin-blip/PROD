import { useRouter } from "expo-router";
import { FlatList } from "react-native";
import { List } from "react-native-paper";
import { api } from "../../api/endpoints";
import type { Box, Page } from "../../api/types";
import { useProjects } from "../../state/ProjectContext";
import { useAsync } from "../../state/useAsync";
import { useFocusReload } from "../../state/useFocusReload";
import { STATUS_LABELS } from "../../ui/format";
import { NoProject } from "../../ui/NoProject";
import { StateView } from "../../ui/StateView";

export default function LabelsScreen() {
  const { currentId, ready } = useProjects();
  if (!ready) return null;
  if (!currentId) return <NoProject />;
  return <LabelList pid={currentId} />;
}

function LabelList({ pid }: { pid: string }) {
  const router = useRouter();
  const boxes = useAsync<Page<Box>>(() => api.boxes(pid, { page_size: 200 }), [pid]);
  useFocusReload(boxes.reload);
  const list = boxes.data?.items ?? [];
  return (
    <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={list.length === 0} emptyText="Сначала создайте коробку на вкладке «Коробки»" onRetry={boxes.reload}>
      <FlatList
        data={list}
        keyExtractor={(b) => String(b.number)}
        renderItem={({ item }) => (
          <List.Item
            title={`Этикетка № ${item.number} · ${item.room}`}
            description={STATUS_LABELS[item.status]}
            left={(p) => <List.Icon {...p} icon="qrcode" />}
            onPress={() => router.push({ pathname: "/projects/[pid]/boxes/[n]/label", params: { pid, n: String(item.number) } })}
          />
        )}
      />
    </StateView>
  );
}
