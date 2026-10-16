import type { ReactNode } from "react";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import { StyleSheet, View } from "react-native";

interface Props {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/** Единые состояния экрана: загрузка, ошибка с повтором, пусто. Используем на каждом экране со списком. */
export function StateView({ loading, error, empty, emptyText = "Пока ничего нет", onRetry, children }: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.text}>
          {error}
        </Text>
        {onRetry ? <Button mode="contained-tonal" onPress={onRetry}>Повторить</Button> : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.text}>
          {emptyText}
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 },
  text: { textAlign: "center" },
});
