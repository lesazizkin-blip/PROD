export interface StableNumber { number: number | null; hits: number }
/** Ambiguous or empty observations break consecutive agreement. */
export function observeNumber(previous: StableNumber, numbers: number[]): StableNumber {
  const unique = [...new Set(numbers)]
  if (unique.length !== 1) return { number: null, hits: 0 }
  return { number: unique[0], hits: previous.number === unique[0] ? previous.hits + 1 : 1 }
}
