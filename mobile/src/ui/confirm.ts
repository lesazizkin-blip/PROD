import { Alert } from "react-native";

/** Диалог подтверждения (требование ТЗ: удаление с подтверждением). */
export function confirmDelete(title: string, message: string, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: "Отмена", style: "cancel" },
    { text: "Удалить", style: "destructive", onPress: onConfirm },
  ]);
}
