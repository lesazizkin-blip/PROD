import type { Box, BoxStatus } from '../../api/types'
import { locationFor } from './boxLocations'

/** Visual-only layer: the saved status and list reload never depend on animation completion. */
export function animateBoxTransfer(source: HTMLElement | null, box: Box, to: BoxStatus) {
  if (!source || !source.isConnected || locationFor(box.status) === locationFor(to) || !source.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return
  const destination = document.getElementById(`place-${locationFor(to)}`)
  if (!destination) return
  const from = source.getBoundingClientRect(), target = destination.getBoundingClientRect()
  if (from.bottom < 0 || from.top > innerHeight || target.bottom < 70 || target.top > innerHeight) return
  const parcel = document.createElement('div')
  parcel.className = 'box-transfer-parcel'
  parcel.setAttribute('aria-hidden', 'true')
  const label = document.createElement('div')
  const number = document.createElement('b'); number.textContent = String(box.number).padStart(3, '0')
  const room = document.createElement('span'); room.textContent = box.room
  label.append(number, room); parcel.append(label)
  Object.assign(parcel.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` })
  document.body.append(parcel)
  const dx = target.left + target.width / 2 - from.left - from.width / 2
  const dy = target.top + target.height / 2 - from.top - from.height / 2
  try {
    const animation = parcel.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: .8 },
    { transform: 'translate(-7px, 9px) scale(1.02)', opacity: 1, offset: .16 },
    { transform: `translate(${dx}px, ${dy}px) scale(.16)`, opacity: .5 },
  ], { duration: 750, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'forwards' })
    void animation.finished.catch(() => {}).finally(() => parcel.remove())
  } catch { parcel.remove() }
}
