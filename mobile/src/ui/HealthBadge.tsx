import { Chip } from "react-native-paper";
import { api } from "../api/endpoints";
import { useAsync } from "../state/useAsync";

/** Индикатор здоровья сервера (раздел 8 ТЗ): GET /api/health. */
export function HealthBadge() {
  const { data, loading, error, reload } = useAsync(() => api.health(), []);
  const ok = !loading && !error && data?.status === "ok";
  return (
    <Chip compact icon={ok ? "check-circle" : loading ? "progress-clock" : "alert-circle"} onPress={reload}>
      {loading ? "Проверка…" : ok ? "Сервер работает" : "Сервер недоступен"}
    </Chip>
  );
}
