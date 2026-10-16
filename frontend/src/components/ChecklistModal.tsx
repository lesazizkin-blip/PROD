import { useState } from 'react'
import { api } from '../api/endpoints'
import type { ChecklistFlags, ChecklistSuggestion } from '../api/types'
import { useAction } from '../state/useAction'
import ErrorAlert from '../ui/ErrorAlert'
import { STAGE_LABELS } from '../ui/format'
import Modal from './Modal'

const OPTIONS: { key: keyof ChecklistFlags; label: string }[] = [
  { key: 'with_children', label: 'Переезжаем с детьми' },
  { key: 'with_pets', label: 'Переезжаем с животными' },
  { key: 'other_city', label: 'Переезд в другой город' },
]

/** Умный чек-лист: выбираем особенности переезда, смотрим что предлагается, добавляем в план одной кнопкой. */
export default function ChecklistModal({ pid, onClose, onApplied }: { pid: string; onClose: () => void; onApplied: () => void }) {
  const [flags, setFlags] = useState<ChecklistFlags>({ with_children: false, with_pets: false, other_city: false })
  const [suggestion, setSuggestion] = useState<ChecklistSuggestion | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const { busy, error, run } = useAction()

  const anyFlag = flags.with_children || flags.with_pets || flags.other_city
  const total = (suggestion?.suggested_tasks.length ?? 0) + (suggestion?.suggested_first_day.length ?? 0)

  return (
    <Modal title="Умный чек-лист" onClose={onClose}>
      {done ? (
        <>
          <p>{done}</p>
          <button className="primary" onClick={onClose}>Готово</button>
        </>
      ) : (
        <>
          <p className="muted">Отметьте особенности переезда: добавим подходящие задачи и вещи для коробки первого дня. Уже имеющиеся не дублируются.</p>
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
          <ErrorAlert message={error} />

          {suggestion ? (
            <div className="stack">
              {total === 0 ? <p className="muted">Всё подходящее уже есть в плане.</p> : null}
              {suggestion.suggested_tasks.length > 0 ? (
                <div>
                  <b>Задачи</b>
                  <ul>{suggestion.suggested_tasks.map((t) => <li key={t.title}>{t.title} <span className="muted small">({STAGE_LABELS[t.stage]})</span></li>)}</ul>
                </div>
              ) : null}
              {suggestion.suggested_first_day.length > 0 ? (
                <div>
                  <b>В коробку первого дня</b>
                  <ul>{suggestion.suggested_first_day.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              ) : null}
              <button
                className="primary"
                disabled={busy || total === 0}
                onClick={() =>
                  run(async () => {
                    const r = await api.applyChecklist(pid, flags)
                    setDone(`Добавлено: задач ${r.added_tasks}, пунктов для первого дня ${r.added_first_day}.`)
                    onApplied()
                  })
                }
              >
                Добавить всё ({total})
              </button>
            </div>
          ) : (
            <button className="primary" disabled={busy || !anyFlag} onClick={() => run(async () => setSuggestion(await api.suggestChecklist(pid, flags)))}>
              Показать, что добавим
            </button>
          )}
        </>
      )}
    </Modal>
  )
}
