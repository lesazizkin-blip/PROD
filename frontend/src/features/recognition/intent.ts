import { isCompactCode, parseUniversalCode } from './qr'
const KEY = 'movermate.recognition.intent.v1'
/** Only the QR payload is retained for five minutes, never a photograph. */
export function saveIntent(code: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ code, expires: Date.now() + 300_000 })) } catch { /* Private storage may be disabled. */ }
}
export function clearIntent() {
  try { sessionStorage.removeItem(KEY) } catch { /* Optional persistence. */ }
}
export function readIntent(): string | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    if (data && data.expires > Date.now() && typeof data.code === 'string' && (isCompactCode(data.code) || parseUniversalCode(data.code))) return data.code
  } catch { /* Invalid or unavailable storage. */ }
  clearIntent()
  return null
}
