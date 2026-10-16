import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";

/** Перезагружает данные экрана при возврате на него (после изменений на других экранах). */
export function useFocusReload(reload: () => void): void {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false; // первую загрузку уже сделал useAsync
        return;
      }
      reload();
    }, [reload]),
  );
}
