import type { RoomBox } from '../../api/types'

/** Складывает отмеченные коробки из раскладки по фото в одну: она встаёт на место первой отмеченной,
 *  вещи без повторов (без учёта регистра), подписи и советы через разделитель. Возвращает новый список
 *  и номер объединённой коробки в нём; меньше двух отмеченных - список без изменений. */
export function mergeRoomBoxes(boxes: RoomBox[], chosen: Set<number>): { boxes: RoomBox[]; merged: number } {
  const picked = boxes.map((_, i) => i).filter((i) => chosen.has(i))
  if (picked.length < 2) return { boxes, merged: picked[0] ?? -1 }
  const seen = new Set<string>()
  const items: string[] = []
  for (const i of picked) {
    for (const item of boxes[i].items) {
      const key = item.trim().toLowerCase()
      if (key && !seen.has(key)) {
        seen.add(key)
        items.push(item.trim())
      }
    }
  }
  const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))]
  const box: RoomBox = {
    label: unique(picked.map((i) => boxes[i].label)).join(' + '),
    items,
    tip: unique(picked.map((i) => boxes[i].tip)).join(' '),
  }
  const result: RoomBox[] = []
  let merged = -1
  boxes.forEach((b, i) => {
    if (i === picked[0]) {
      merged = result.length
      result.push(box)
    } else if (!chosen.has(i)) result.push(b)
  })
  return { boxes: result, merged }
}
