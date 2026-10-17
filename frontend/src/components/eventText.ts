import { BOX_STATUSES, type AppEvent, type BoxStatus, type ItemStatus } from '../api/types'
import { ITEM_STATUS_LABELS, STATUS_LABELS } from '../ui/format'
import { rub } from '../features/journey/money'

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const status = (v: unknown) => STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? text(v)

const PROJECT_FIELDS: Record<string, string> = {
  name: 'название', move_date: 'дата переезда', address_from: 'адрес «откуда»', address_to: 'адрес «куда»', qr_mode: 'формат QR',
}
const isBack = (from: unknown, to: unknown) => BOX_STATUSES.indexOf(to as BoxStatus) < BOX_STATUSES.indexOf(from as BoxStatus)

/** Человеческое описание записи журнала событий (никаких служебных кодов в интерфейсе). */
export function describeEvent(e: AppEvent): string {
  const d = e.data
  const box = `Коробка № ${e.entity_id}`
  switch (e.type) {
    case 'project.created': return `Создан проект «${text(d.name)}»`
    case 'project.updated': {
      const fields = Array.isArray(d.fields) ? d.fields.map((f) => PROJECT_FIELDS[String(f)] ?? String(f)) : []
      return fields.length ? `Изменены настройки проекта: ${fields.join(', ')}` : 'Изменены настройки проекта'
    }
    case 'task.created': return `Новая задача «${text(d.title)}»`
    case 'task.completed': return `Выполнена задача «${text(d.title)}»`
    case 'task.reopened': return `Задача снова в работе: «${text(d.title)}»`
    case 'box.created': return `Создана коробка № ${e.entity_id}${d.room ? ` (${text(d.room)})` : ''}`
    case 'box.deleted': return `Удалена коробка № ${e.entity_id}${d.room ? ` (${text(d.room)})` : ''}`
    case 'box.status_changed':
      return isBack(d.from, d.to)
        ? `${box} возвращена на этап «${status(d.to)}» (была «${status(d.from)}»)`
        : `${box}: ${status(d.from)} → ${status(d.to)}`
    case 'box.status_corrected':
      return `${box} возвращена на этап «${status(d.to)}» (была «${status(d.from)}»)${text(d.reason) ? `: ${text(d.reason)}` : ''}`
    case 'item.lost': return `Вещь потеряна${d.name ? `: «${text(d.name)}»` : ''}`
    case 'item.found': return `Вещь нашлась${d.name ? `: «${text(d.name)}»` : ''}`
    case 'item.moved': return `${d.name ? `«${text(d.name)}»` : 'Вещь'} переложили из коробки № ${String(d.from_box ?? '?')} в № ${String(d.to_box ?? '?')}`
    case 'item.damage_changed': return `${d.damaged ? 'Отмечено повреждение' : 'Снята отметка о повреждении'}${d.name ? `: «${text(d.name)}»` : ''}`
    case 'item.status_changed': {
      const to = ITEM_STATUS_LABELS[d.to as ItemStatus]
      return `${d.name ? `«${text(d.name)}»` : 'Вещь'}: ${to ? `теперь «${to.toLowerCase()}»` : 'изменён статус'}`
    }
    case 'first_day.bound': return `${d.name ? `«${text(d.name)}»` : 'Вещь первого дня'} положили в коробку № ${String(d.box_number ?? '')}`
    case 'expense.created': return `В бюджет добавлена статья${d.title ? ` «${text(d.title)}»` : ''}${typeof d.planned === 'number' && d.planned ? ` — ${rub(d.planned)}` : ''}`
    case 'expense.deleted': return `Из бюджета удалена статья${d.title ? ` «${text(d.title)}»` : ''}`
    case 'assistant.checklist_applied': return 'Умный чек-лист добавлен в план'
    default: return 'Изменения в проекте'
  }
}

