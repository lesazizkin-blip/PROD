import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { Button, HelperText, Text, TextInput } from "react-native-paper";
import { api } from "../api/endpoints";
import { ApiError, errorMessage } from "../api/client";
import { useProjects } from "../state/ProjectContext";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Демо-проект из `python -m app.seed` (фиксированный id): позволяет открыть приложение с готовыми данными
const DEMO_PROJECT_ID = process.env.EXPO_PUBLIC_DEMO_PROJECT_ID ?? "00000000-0000-4000-8000-000000000001";

/** Форма создания проекта: показывается на экранах, пока ни одного проекта нет (сценарий 1). */
export function NoProject({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDemo() {
    setBusy(true);
    setError(null);
    try {
      const project = await api.getProject(DEMO_PROJECT_ID);
      add({ id: project.id, name: project.name });
      onDone?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const nameError = name.trim().length === 0 || name.length > 120;
  const dateError = !DATE_RE.test(date) || Number.isNaN(Date.parse(date));

  async function submit() {
    if (nameError || dateError) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({ name: name.trim(), move_date: date });
      add({ id: project.id, name: project.name });
      onDone?.();
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors ? Object.values(e.fieldErrors).join(". ") || errorMessage(e) : errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text variant="headlineSmall">Новый переезд</Text>
        <Text variant="bodyMedium">Создайте проект: после этого появится готовый план задач.</Text>
        <TextInput label="Название" value={name} onChangeText={setName} mode="outlined" maxLength={120} />
        <TextInput
          label="Дата переезда (ГГГГ-ММ-ДД)"
          value={date}
          onChangeText={setDate}
          mode="outlined"
          keyboardType="numbers-and-punctuation"
          placeholder="2026-11-01"
        />
        <HelperText type="error" visible={!!error}>
          {error}
        </HelperText>
        <Button mode="contained" onPress={submit} loading={busy} disabled={busy || nameError || dateError}>
          Создать проект
        </Button>
        <Button mode="text" onPress={openDemo} disabled={busy}>
          Открыть демо-проект
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: 24, gap: 12 },
});
