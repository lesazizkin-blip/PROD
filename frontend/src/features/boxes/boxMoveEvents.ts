import { useEffect, useState } from 'react'
import type { Box, BoxStatus } from '../../api/types'

export interface BoxMove { pid: string; number: number; room: string; from: BoxStatus; to: BoxStatus; id: number; correction: boolean }
const EVENT = 'movermate:box-moved'
let sequence = 0
/** Called only after a successful write; no inventory is persisted. */
export function recordBoxMove(pid: string, box: Pick<Box, 'number' | 'room' | 'status'>, to: BoxStatus, correction = false) {
  if (box.status === to) return
  window.dispatchEvent(new CustomEvent<BoxMove>(EVENT, { detail: { pid, number: box.number, room: box.room, from: box.status, to, id: ++sequence, correction } }))
}
export function useBoxMoveEvent() {
  const [move, setMove] = useState<BoxMove | null>(null)
  useEffect(() => {
    const receive = (event: Event) => setMove((event as CustomEvent<BoxMove>).detail)
    window.addEventListener(EVENT, receive)
    return () => window.removeEventListener(EVENT, receive)
  }, [])
  return move
}
