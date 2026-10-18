import type { Box, BoxStatus, Page, Progress } from '../../api/types'

export type BoxLocation = 'old' | 'truck' | 'new'
export const BOX_LOCATIONS: BoxLocation[] = ['old', 'truck', 'new']
export const LOCATION_LABELS: Record<BoxLocation, string> = { old: 'Старый дом', truck: 'В машине', new: 'Новый дом' }
export const locationFor = (status: BoxStatus): BoxLocation => status === 'loaded' ? 'truck' : status === 'delivered' || status === 'unpacked' ? 'new' : 'old'
export const locationCounts = (summary: Progress | null) => ({ old: (summary?.by_status.packing ?? 0) + (summary?.by_status.packed ?? 0), truck: summary?.by_status.loaded ?? 0, new: (summary?.by_status.delivered ?? 0) + (summary?.by_status.unpacked ?? 0) })

export type LocationPages = Record<BoxLocation, number>
export type LocationBoxes = Partial<Record<BoxLocation, Page<Box> | null>>
export const INITIAL_LOCATION_PAGES: LocationPages = { old: 1, truck: 1, new: 1 }
export const LOCATION_PAGE_SIZE = 12
