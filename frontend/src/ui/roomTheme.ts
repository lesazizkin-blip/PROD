import type { CSSProperties } from 'react'

const THEMES = {
  kitchen: { color: '#bd492c', dark: '#f1a187' },
  bedroom: { color: '#315e91', dark: '#a3c4ec' },
  living: { color: '#3d7659', dark: '#a1cdb1' },
  office: { color: '#73598b', dark: '#c8b1e0' },
  hall: { color: '#927132', dark: '#d9c38b' },
  other: { color: '#737064', dark: '#c5c2b2' },
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

export const roomStyle = (room: string): CSSProperties => ({ '--room-color': roomTheme(room).color, '--room-color-dark': roomTheme(room).dark }) as CSSProperties
