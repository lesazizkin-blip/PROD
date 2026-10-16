import { StyleSheet } from "react-native";
import { Text } from "react-native-paper";

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text variant="titleSmall" style={styles.title}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 20, marginBottom: 8, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.6 },
});
