/** Validate the whole label; never extract digits from arbitrary OCR text. */
export function normalizeNumber(text: string): number | null {
  const match = text.trim().match(/^#?([0-9]+)$/)
  if (!match) return null
  const n = Number(match[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export interface HandwritingResult {
  /** Engine output, retained for review; no fabricated confidence scores. */
  text: string
  candidates: string[]
  diagnostics: { engine: string; elapsedMs: number }
}

/** Integrator supplies a validated LOCAL worker, never an upload endpoint. */
export type LocalHandwriting = (photo: Blob, signal: AbortSignal) => Promise<HandwritingResult>
export type ResolveCode = (code: string) => Promise<{ project_id: string; box_number: number }>

export function normalizeCandidates(values: string[]): number[] {
  const numbers = values.map(normalizeNumber).filter((n): n is number => n !== null)
  return [...new Set(numbers)]
}
