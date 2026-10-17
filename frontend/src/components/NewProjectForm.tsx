import { useState } from 'react'
import { ArrowRight, Calendar, FileText, House, ListChecks, MapPin, QrCode } from 'lucide-react'
import { api } from '../api/endpoints'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import MoveIllustration from './MoveIllustration'

// Быстрые шаблоны: заполняют название, дальше пользователь правит как хочет
const PRESETS = [
  { emoji: '📦', label: 'Квартира', name: 'Переезд квартиры' },
  { emoji: '🏢', label: 'Офис', name: 'Переезд офиса' },
  { emoji: '🛋️', label: 'Комната', name: 'Переезд комнаты' },
]

const WHY = [
  { icon: FileText, text: 'Безбумажный учёт' },
  { icon: ListChecks, text: 'Готовые чек-листы' },
  { icon: QrCode, text: 'QR-маркировка' },
]

/** Создание проекта (сценарий 1). Показывается, пока проектов нет, и на странице /new. */
export default function NewProjectForm({ onDone }: { onDone?: () => void }) {
  const { add } = useProjects()
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [withAddresses, setWithAddresses] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const { busy, error, submit } = useAction()

  const invalid = name.trim().length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)

  const create = async () => {
    // адреса необязательны (раздел 5.1 ТЗ): отправляем, только если их указали
    const addresses = {
      ...(from.trim() ? { address_from: from.trim() } : {}),
      ...(to.trim() ? { address_to: to.trim() } : {}),
    }
    const project = await api.createProject({ name: name.trim(), move_date: date, ...addresses })
    add({ id: project.id, name: project.name, role: 'owner' })
    onDone?.()
  }

  return (
    <div className="new-project">
      <form className="card new-project__card" onSubmit={submit(create)}>
        <div className="new-project__art"><MoveIllustration /></div>
        <div className="stack new-project__body">
          <div>
            <h2>Новый переезд ✨</h2>
            <p className="muted">Создайте проект, чтобы получить пошаговый план задач, маркировать коробки и не потерять ни одной вещи!</p>
          </div>
          <label>
            Название переезда
            <span className="input-icon">
              <House className="icon-sm" aria-hidden />
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Например: Переезд на Лесную" data-autofocus />
            </span>
          </label>
          <label>
            Дата переезда
            <span className="input-icon input-icon--end">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Calendar className="icon-sm" aria-hidden />
            </span>
          </label>
          {withAddresses ? (
            <div className="form-grid">
              <label>
                Откуда (необязательно)
                <input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={300} placeholder="ул. Садовая, 5" />
              </label>
              <label>
                Куда (необязательно)
                <input value={to} onChange={(e) => setTo(e.target.value)} maxLength={300} placeholder="ул. Лесная, 12" />
              </label>
            </div>
          ) : (
            <button type="button" className="link small new-project__more" onClick={() => setWithAddresses(true)}>
              <MapPin className="icon-sm" aria-hidden />Добавить адреса (необязательно)
            </button>
          )}
          <ErrorAlert message={error} />
          <button className="primary cta" type="submit" disabled={busy || invalid}>
            Создать проект<ArrowRight className="icon-sm" aria-hidden />
          </button>
          <div className="presets" role="group" aria-label="Шаблон названия">
            <span className="muted small">Выбрать шаблон:</span>
            {PRESETS.map((p) => (
              <button key={p.label} type="button" className={name === p.name ? 'preset on' : 'preset'} onClick={() => setName(p.name)}>
                <span aria-hidden>{p.emoji}</span> {p.label}
              </button>
            ))}
          </div>
        </div>
      </form>

      <aside className="why" aria-label="Почему MoverMate">
        <h3>Почему MoverMate?</h3>
        {WHY.map((w) => (
          <div key={w.text} className="why__item">
            <span>{w.text}</span>
            <w.icon className="icon" aria-hidden />
          </div>
        ))}
      </aside>
    </div>
  )
}
