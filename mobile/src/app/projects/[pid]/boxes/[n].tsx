import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { List, Text } from "react-native-paper";
import { api } from "../../../../api/endpoints";
import { useAsync } from "../../../../state/useAsync";
import { StateView } from "../../../../ui/StateView";

// Карточка коробки. Сюда ведёт QR: movermate://projects/{pid}/boxes/{n} (открытие только читает, дублей не создаёт).
export default function BoxCardScreen() {
  const { pid, n } = useLocalSearchParams<{ pid: string; n: string }>();
  const number = Number(n);
  const valid = !!pid && Number.isInteger(number) && number >= 1;
  const { data, loading, error, reload } = useAsync(
    () => (valid ? api.getBox(pid, number) : Promise.reject(new Error("Некорректная ссылка на коробку"))),
    [pid, number],
  );
  return (
    <StateView loading={loading} error={error} onRetry={reload}>
      {data ? (
        <ScrollView>
          <Text variant="headlineMedium" style={{ padding: 16 }}>
            Коробка № {data.number} · {data.room}
          </Text>
          <Text variant="bodyLarge" style={{ paddingHorizontal: 16 }}>Статус: {data.status}</Text>
          {data.items.map((i) => (
            <List.Item key={i.id} title={i.name} description={i.lost ? "потеряна" : undefined} />
          ))}
        </ScrollView>
      ) : null}
    </StateView>
  );
}
