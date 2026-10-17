import { Link } from 'react-router-dom'
import { api } from '../api/endpoints'
import type { AppEvent, Reminder } from '../api/types'
import { useAsync } from '../state/useAsync'
import { STATUS_LABELS, boxPath } from '../ui/format'
import StateView from '../ui/StateView'
import Modal from './Modal'
import { useState } from 'react'
import Pagination from '../ui/Pagination'

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const status = (v: unknown) => STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? text(v)

/** Человеческое описание записи журнала событий. */
function describeEvent(e: AppEvent): string {
  const d = e.data
  switch (e.type) {
    case 'project.created': return `Создан проект «${text(d.name)}»`
    case 'project.updated': return 'Изменены настройки проекта'
    case 'task.created': return `Новая задача «${text(d.title)}»`
    case 'task.completed': return `Выполнена задача «${text(d.title)}»`
    case 'task.reopened': return `Задача снова в работе: «${text(d.title)}»`
    case 'box.created': return `Создана коробка № ${e.entity_id}${d.room ? ` (${text(d.room)})` : ''}`
    case 'box.deleted': return `Удалена коробка № ${e.entity_id}`
    case 'box.status_changed': return `Коробка № ${e.entity_id}: ${status(d.from)} → ${status(d.to)}`
    case 'item.lost': return `Вещь потеряна${d.name ? `: «${text(d.name)}»` : ''}`
    case 'item.found': return `Вещь нашлась${d.name ? `: «${text(d.name)}»` : ''}`
    case 'item.status_changed': return `Изменён статус вещи${d.name ? ` «${text(d.name)}»` : ''}`
    case 'assistant.checklist_applied': return 'Умный чек-лист добавлен в план'
    default: return e.type
  }
}

const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Колокольчик: коробки, которые ждут описи, и журнал важных событий проекта. */
export default function NotificationsModal({ pid, reminders, onClose }: { pid: string | null; reminders: Reminder[]; onClose: () => void }) {
  const [page, setPage] = useState(1)
  const events = useAsync(() => (pid ? api.events(pid, { page, page_size: 30 }) : Promise.resolve(null)), [pid, page])
  const list = events.data?.items ?? []
  return (
    <Modal title="Уведомления" onClose={onClose} variant="drawer">
      {!pid ? <p className="muted">Сначала создайте проект.</p> : null}
      {reminders.length > 0 && pid ? (
        <section className="stack">
          <h3 className="section-title">Ждут описи содержимого</h3>
          <div className="card flush">
            {reminders.map((r) => (
              <Link key={r.box.number} to={boxPath(pid, r.box.number)} className="list-row" onClick={onClose}>
                <span className="grow">
                  <span className="title">Коробка № {r.box.number} · {r.box.room}</span>
                  <span className="sub">{r.overdue ? 'Давно ждёт: заполните список вещей' : 'Список вещей отложен'}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {pid ? (
        <section className="stack">
          <h3 className="section-title">Журнал событий</h3>
          <StateView loading={events.loading && !events.data} error={events.error} empty={list.length === 0} emptyText="Событий пока нет" onRetry={events.reload}>
            <ul className="plain timeline">
              {list.map((e) => (
                <li key={e.id}>
                  <span>{describeEvent(e)}</span>
                  <time className="muted small" dateTime={e.created_at}>{when(e.created_at)}</time>
                </li>
              ))}
            </ul>
          </StateView>
          <Pagination page={page} pageSize={30} total={events.data?.total ?? 0} busy={events.loading} onChange={setPage} label="Страницы журнала" />
        </section>
      ) : null}
    </Modal>
  )
}
