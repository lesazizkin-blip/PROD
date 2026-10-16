import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Icon, Text, useTheme } from "react-native-paper";

interface Props {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  emptyText?: string;
  emptyIcon?: string;
  onRetry?: () => void;
  children: ReactNode;
}

/** Единые состояния экрана: загрузка, ошибка с повтором, пусто. Используем на каждом экране со списком. */
export function StateView({ loading, error, empty, emptyText = "Пока ничего нет", emptyIcon = "tray-outline", onRetry, children }: Props) {
  const theme = useTheme();
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
        <Icon source="wifi-off" size={48} color={theme.colors.error} />
        <Text variant="bodyLarge" style={styles.text}>
          {error}
        </Text>
        {onRetry ? (
          <Button mode="contained-tonal" icon="refresh" onPress={onRetry}>
            Повторить
          </Button>
        ) : null}
      </View>
    );
  }
  if (empty) {
    return (
      <View style={styles.center}>
        <Icon source={emptyIcon} size={56} color={theme.colors.outline} />
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
