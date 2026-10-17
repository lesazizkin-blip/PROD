import type { Page } from './types'

/** For complete select-option lists; primary screens use visible pagination. */
export async function readAllPages<T>(load: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const first = await load(1)
  const items = [...first.items]
  for (let page = 2; items.length < first.total; page++) {
    const next = await load(page)
    if (next.items.length === 0) throw new Error('Список изменился во время загрузки. Обновите его и попробуйте ещё раз.')
    items.push(...next.items)
  }
  return items
}
