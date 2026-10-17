import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../api/endpoints'
import type { ChecklistFlags, ChecklistSuggestion, Stage } from '../api/types'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import { STAGES, STAGE_LABELS, parseTaskLines } from '../ui/format'
import Modal from './Modal'

const OPTIONS: { key: keyof ChecklistFlags; label: string }[] = [
  { key: 'with_children', label: 'Переезжаем с детьми' },
  { key: 'with_pets', label: 'Переезжаем с животными' },
  { key: 'other_city', label: 'Переезд в другой город' },
]

const CUSTOM_COLOR = '#7c3aed'

/** Умный чек-лист: готовые особенности переезда (на правилах, без внешнего ИИ), типовые задачи
 *  и своя особенность, которую пользователь описывает сам. */
export default function ChecklistModal({ pid, onClose, onApplied }: { pid: string; onClose: () => void; onApplied: () => void }) {
  const [flags, setFlags] = useState<ChecklistFlags>({ with_children: false, with_pets: false, other_city: false })
  const [typical, setTypical] = useState(false)
  const [suggestion, setSuggestion] = useState<ChecklistSuggestion | null>(null)
  const [done, setDone] = useState<string | null>(null)
  // своя особенность: название (станет категорией задач), этап и задачи по строке
  const [ownName, setOwnName] = useState('')
  const [ownStage, setOwnStage] = useState<Stage>('before')
  const [ownTasks, setOwnTasks] = useState('')
  const templates = useAsync(() => api.taskTemplates(), [])
  const { busy, error, run } = useAction()

  const anyFlag = flags.with_children || flags.with_pets || flags.other_city
  const ownList = parseTaskLines(ownTasks)
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
        const r = await api.applyChecklist(pid, flags)
        tasks += r.added_tasks
        firstDay += r.added_first_day
      }
      if (typical) tasks += (await api.applyTemplates(pid)).added
      finish(`Добавлено: задач ${tasks}, пунктов для первого дня ${firstDay}. Уже имеющиеся не дублировались.`)
    })

  const applyOwn = () =>
    run(async () => {
      const name = ownName.trim()
      for (const title of ownList) {
        await api.createTask(pid, { stage: ownStage, title, category: name, category_color: CUSTOM_COLOR })
      }
      finish(`Особенность «${name}»: добавлено задач ${ownList.length} на этап «${STAGE_LABELS[ownStage]}».`)
    })

  return (
    <Modal title="Умный чек-лист" onClose={onClose} dirty={!done && (ownName.trim() !== '' || ownTasks.trim() !== '')}>
      {done ? (
        <>
          <p>{done}</p>
          <button className="primary" onClick={onClose}>Готово</button>
        </>
      ) : (
        <>
          <p className="muted">Отметьте особенности переезда: добавим подходящие задачи и вещи для первого дня. Уже имеющиеся не дублируются.</p>
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
              {suggestion.suggested_first_day.length > 0 ? (
                <div>
                  <b>Для первого дня</b>
                  <ul>{suggestion.suggested_first_day.map((t) => <li key={t}>{t}</li>)}</ul>
                </div>
              ) : null}
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

          <fieldset className="own-feature stack">
            <legend>Своя особенность</legend>
            <p className="muted small">Например, «Пианино» или «Ремонт в новой квартире»: задачи появятся в плане с этой категорией.</p>
            <label>
              Название
              <input value={ownName} onChange={(e) => setOwnName(e.target.value)} maxLength={40} placeholder="Пианино" />
            </label>
            <label>
              Этап
              <select value={ownStage} onChange={(e) => setOwnStage(e.target.value as Stage)}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </label>
            <label>
              Задачи (каждая с новой строки)
              <textarea rows={4} value={ownTasks} onChange={(e) => setOwnTasks(e.target.value)} placeholder={'Заказать такелажников\nНастроить после перевозки'} />
            </label>
            <button className="tonal" disabled={busy || !ownName.trim() || ownList.length === 0} onClick={applyOwn}>
              <Plus className="icon-sm" aria-hidden />Добавить задачи ({ownList.length})
            </button>
          </fieldset>
          <ErrorAlert message={error} />
        </>
      )}
    </Modal>
  )
}
