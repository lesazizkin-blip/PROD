import type { CSSProperties } from 'react'

const THEMES = {
  kitchen: { color: '#bd492c' },
  bedroom: { color: '#315e91' },
  living: { color: '#3d7659' },
  office: { color: '#73598b' },
  hall: { color: '#927132' },
  other: { color: '#737064' },
} as const

/** Shared Figma room palette: decoration only, never a box status or priority. */
export function roomTheme(room: string) {
  const name = room.trim().toLocaleLowerCase('ru-RU')
  if (name.includes('кухн')) return THEMES.kitchen
  if (name.includes('спальн')) return THEMES.bedroom
  if (name.includes('гостин')) return THEMES.living
  if (name.includes('кабинет') || name.includes('рабоч')) return THEMES.office
  if (name.includes('прихож') || name.includes('коридор')) return THEMES.hall
  return THEMES.other
}

export const roomStyle = (room: string): CSSProperties => ({ '--room-color': roomTheme(room).color }) as CSSProperties
