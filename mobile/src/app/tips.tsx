import { Fragment } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Card, Icon, Text } from "react-native-paper";
import { api } from "../api/endpoints";
import type { Tip, TipTopic } from "../api/types";
import { useAsync } from "../state/useAsync";
import { SectionTitle } from "../ui/SectionTitle";
import { StateView } from "../ui/StateView";

const TOPICS: { topic: TipTopic; title: string; icon: string }[] = [
  { topic: "fragile", title: "Хрупкие вещи", icon: "glass-fragile" },
  { topic: "carry_with_you", title: "Берём с собой", icon: "briefcase-outline" },
  { topic: "pack_last", title: "Пакуем последними", icon: "clock-end" },
];

// Памятки лежат в БД сервера (раздел 5.5 ТЗ): хранятся локально, без внешних источников.
export default function TipsScreen() {
  const tips = useAsync<Tip[]>(() => api.tips(), []);
  const list = tips.data ?? [];
  return (
    <StateView loading={tips.loading} error={tips.error} empty={list.length === 0} emptyText="Памяток пока нет" onRetry={tips.reload}>
      <ScrollView contentContainerStyle={styles.content}>
        {TOPICS.map(({ topic, title, icon }) => (
          <Fragment key={topic}>
            <SectionTitle>{title}</SectionTitle>
            {list
              .filter((t) => t.topic === topic)
              .map((t) => (
                <Card key={t.id} style={styles.card}>
                  <Card.Title title={t.title} titleVariant="titleMedium" left={(p) => <Icon source={icon} size={p.size} />} />
                  <Card.Content>
                    <Text variant="bodyMedium">{t.body}</Text>
                  </Card.Content>
                </Card>
              ))}
          </Fragment>
        ))}
      </ScrollView>
    </StateView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 8 },
});
