import { useLocalSearchParams } from "expo-router";
import * as Print from "expo-print";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, HelperText, Text } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";
import { api, boxDeepLink } from "../../../../../api/endpoints";
import { errorMessage } from "../../../../../api/client";
import type { Label } from "../../../../../api/types";
import { useAsync } from "../../../../../state/useAsync";
import { StateView } from "../../../../../ui/StateView";

// Этикетка: крупный номер, комната, QR. QR строится на устройстве (без внешних сервисов).
export default function LabelScreen() {
  const { pid, n } = useLocalSearchParams<{ pid: string; n: string }>();
  const number = Number(n);
  const label = useAsync<Label>(() => api.label(pid, number), [pid, number]);
  const qr = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function print(l: Label) {
    setError(null);
    qr.current?.toDataURL(async (data) => {
      try {
        const html = `<html><body style="font-family:sans-serif;text-align:center;padding:48px">
          <div style="font-size:160px;font-weight:700">${l.number}</div>
          <div style="font-size:48px;margin-bottom:24px">${escapeHtml(l.room)}</div>
          <img src="data:image/png;base64,${data}" width="360" height="360"/>
          <div style="font-size:20px;margin-top:16px;color:#555">${escapeHtml(l.project_name)}</div></body></html>`;
        await Print.printAsync({ html }); // системный диалог: печать или «Сохранить как PDF»
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  const l = label.data;
  return (
    <StateView loading={label.loading && !l} error={label.error} onRetry={label.reload}>
      {l ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.number}>{l.number}</Text>
          <Text variant="headlineMedium">{l.room}</Text>
          <View style={styles.qr}>
            <QRCode value={boxDeepLink(l)} size={240} getRef={(c) => (qr.current = c)} backgroundColor="white" />
          </View>
          <Text variant="bodyMedium" style={styles.hint}>{l.project_name}</Text>
          {l.items_preview.length ? <Text variant="bodySmall" style={styles.hint}>{l.items_preview.join(" · ")}</Text> : null}
          <Button mode="contained" icon="printer" onPress={() => print(l)}>Печать / PDF</Button>
          <HelperText type="error" visible={!!error}>{error}</HelperText>
        </ScrollView>
      ) : null}
    </StateView>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const styles = StyleSheet.create({
  content: { alignItems: "center", padding: 24, gap: 8 },
  number: { fontSize: 120, fontWeight: "700", lineHeight: 130 },
  qr: { padding: 16, backgroundColor: "white", borderRadius: 16, marginVertical: 16 },
  hint: { opacity: 0.7, textAlign: "center" },
});
