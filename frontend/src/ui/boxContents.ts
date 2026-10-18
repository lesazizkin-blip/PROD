import type { Box } from '../api/types'

export const itemPreviewText = (item: { name: string; quantity?: number }) => `${item.name}${(item.quantity ?? 1) > 1 ? ` × ${item.quantity}` : ''}`

export function boxContentsText(box: Box, limit = 3) {
  const preview = box.contents_preview ?? []
  if (!box.items_count) return box.fill_later ? 'Опись добавим позже' : 'Пока пусто'
  if (!preview.length) return 'Опись внутри коробки'
  return preview.slice(0, limit).map(itemPreviewText).join(', ')
}
