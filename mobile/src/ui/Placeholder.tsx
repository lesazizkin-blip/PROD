import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";

/** Заглушка экрана на время разработки: убирается, когда экран готов. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.center}>
      <Text variant="titleLarge">{title}</Text>
      <Text variant="bodyMedium" style={styles.note}>
        {note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  note: { textAlign: "center" },
});
