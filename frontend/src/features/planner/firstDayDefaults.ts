export const FIRST_DAY_BASICS = ['Зубные щётки и паста', 'Зарядки для телефонов', 'Чайник', 'Постельное бельё']
export const normalizeTitle = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
export function firstDayLines(text: string) {
  return [...new Map(text.split('\n').map(s => s.trim()).filter(Boolean).map(s => [normalizeTitle(s), s])).values()]
}
