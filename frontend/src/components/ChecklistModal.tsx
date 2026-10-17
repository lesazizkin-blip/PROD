import { useState } from 'react'
import { api } from '../api/endpoints'
import type { ChecklistFlags, ChecklistSuggestion } from '../api/types'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import { STAGE_LABELS } from '../ui/format'
import Modal from './Modal'

const OPTIONS: { key: keyof ChecklistFlags; label: string }[] = [
  { key: 'with_children', label: 'Переезжаем с детьми' },
  { key: 'with_pets', label: 'Переезжаем с животными' },
  { key: 'other_city', label: 'Переезд в другой город' },
  { key: 'renting', label: 'Снимаю или сдаю квартиру: осмотр и акт' },
  { key: 'paperwork', label: 'Документы, договоры и смена адреса' },
  { key: 'declutter', label: 'Разобрать вещи до упаковки' },
  { key: 'settling', label: 'Обжиться после переезда' },
]

/** Умный чек-лист: типовые задачи и готовые планы под особенности переезда (на правилах, без внешнего ИИ). */
export default function ChecklistModal({ pid, onClose, onApplied }: { pid: string; onClose: () => void; onApplied: () => void }) {
  const [flags, setFlags] = useState<ChecklistFlags>({ with_children: false, with_pets: false, other_city: false, renting: false, paperwork: false, declutter: false, settling: false })
  const [typical, setTypical] = useState(false)
  const [suggestion, setSuggestion] = useState<ChecklistSuggestion | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const templates = useAsync(() => api.taskTemplates(), [])
  const { busy, error, run } = useAction()

  const anyFlag = Object.values(flags).some(Boolean)
  const typicalCount = typical ? (templates.data?.length ?? 0) : 0
  const total = (suggestion?.suggested_tasks.length ?? 0) + (suggestion?.suggested_first_day.length ?? 0) + typicalCount

  const finish = (message: string) => {
    setDone(message)
    onApplied()
  }

  const applyReady = () =>
    run(async () => {
      let tasks = 0
      let firstDay = 0
      if (anyFlag) {
        const added = await api.applyChecklist(pid, flags)
        tasks += added.added_tasks
        firstDay = added.added_first_day
      }
      if (typical) tasks += (await api.applyTemplates(pid)).added
      finish(`Добавлено задач: ${tasks}, пунктов первого дня: ${firstDay}. Уже имеющиеся не дублировались.`)
    })

  return (
    <Modal title="Умный чек-лист" onClose={onClose}>
      {done ? (
        <>
          <p>{done}</p>
          <button className="primary" onClick={onClose}>Готово</button>
        </>
      ) : (
        <>
          <p className="muted">Отметьте особенности переезда: добавим подходящие задачи. Уже имеющиеся не дублируются.</p>
          <label className="row">
            <input type="checkbox" checked={typical} onChange={(e) => { setTypical(e.target.checked); setSuggestion(null) }} />
            Обычный переезд: типовые задачи{templates.data ? ` (${templates.data.length})` : ''}
          </label>
          {OPTIONS.map((o) => (
            <label key={o.key} className="row">
              <input
                type="checkbox"
                checked={flags[o.key]}
                onChange={(e) => {
                  setFlags({ ...flags, [o.key]: e.target.checked })
                  setSuggestion(null)
                }}
              />
              {o.label}
            </label>
          ))}

          {suggestion ? (
            <div className="stack">
              {total === 0 ? <p className="muted">Всё подходящее уже есть в плане.</p> : null}
              {typical && templates.data?.length ? (
                <div>
                  <b>Типовые задачи</b>
                  <ul>{templates.data.map((t) => <li key={t.id}>{t.title} <span className="muted small">({STAGE_LABELS[t.stage]})</span></li>)}</ul>
                </div>
              ) : null}
              {suggestion.suggested_tasks.length > 0 ? (
                <div>
                  <b>Задачи</b>
                  <ul>{suggestion.suggested_tasks.map((t) => <li key={t.title}>{t.title} <span className="muted small">({STAGE_LABELS[t.stage]})</span></li>)}</ul>
                </div>
              ) : null}
              {suggestion.suggested_first_day.length > 0 ? <div><b>Подготовить на первый день</b><ul>{suggestion.suggested_first_day.map(title => <li key={title}>{title}</li>)}</ul></div> : null}
              <button className="primary" disabled={busy || total === 0} onClick={applyReady}>Добавить всё ({total})</button>
            </div>
          ) : (
            <button
              className="primary"
              disabled={busy || (!anyFlag && !typical)}
              onClick={() => run(async () => setSuggestion(anyFlag ? await api.suggestChecklist(pid, flags) : { suggested_tasks: [], suggested_first_day: [] }))}
            >
              Показать, что добавим
            </button>
          )}

          <ErrorAlert message={error} />
        </>
      )}
    </Modal>
  )
}
