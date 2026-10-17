import { useId, useState } from 'react'
import { request, errorMessage } from '../../api/client'
import type { Stage } from '../../api/types'
import ErrorAlert from '../../ui/ErrorAlert'
import SpeechInput from './SpeechInput'
import type { PersonalPlan, PlanTask } from './types'
import './planner.css'

const stages: Record<Stage, string> = { before: 'До переезда', moving_day: 'День переезда', after: 'После переезда' }

export default function PersonalPlanner({ moveDate, plan, onPlan, busy, onBusy }: {
  moveDate: string
  plan: PersonalPlan | null
  onPlan: (plan: PersonalPlan | null) => void
  busy: boolean
  onBusy: (value: boolean) => void
}) {
  const [description, setDescription] = useState('')
  const [consent, setConsent] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const fieldId = useId()

  function changeDescription(value: string) {
    setDescription(value.slice(0, 4000))
    onPlan(null)
    setError('')
  }

  async function generate() {
    setError('')
    setGenerating(true)
    onBusy(true)
    onPlan(null)
    try {
      const draft = await request<PersonalPlan>('POST', '/projects/plan-preview', {
        body: { description: description.trim(), move_date: moveDate, consent: true },
        timeoutMs: 70_000,
      })
      onPlan(draft)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setGenerating(false)
      onBusy(false)
    }
  }

  function editTask(index: number, changes: Partial<PlanTask>) {
    if (plan) onPlan({ ...plan, tasks: plan.tasks.map((task, i) => i === index ? { ...task, ...changes } : task) })
  }

  return <section className="planner stack" aria-label="Персональный план">
    <div>
      <h3>План под ваш переезд</h3>
      <p className="muted">Необязательно. Расскажите, что важно учесть, — AI предложит задачи в дополнение к стандартному плану.</p>
    </div>
    <label>
      Особенности и пожелания
      <textarea rows={4} maxLength={4000} value={description} disabled={busy || listening}
        onChange={(e) => changeDescription(e.target.value)}
        placeholder="Переезжаем с ребёнком и кошкой в другой город. Есть аквариум, много растений. Работаю из дома — важно быстро подключить интернет." />
    </label>
    <SpeechInput disabled={busy && !listening} onListening={(value) => { setListening(value); onBusy(value) }}
      onText={(text) => changeDescription(`${description}${description ? ' ' : ''}${text}`)} />
    <label className="planner-consent">
      <input type="checkbox" checked={consent} disabled={busy}
        onChange={(e) => setConsent(e.target.checked)} />
      <span>Разрешаю отправить описание и дату переезда внешнему AI-сервису для составления плана. Не указывайте адреса, пароли и личные данные.</span>
    </label>
    <button type="button" onClick={generate}
      disabled={busy || listening || !consent || description.trim().length < 10 || !moveDate}>
      {generating ? 'Составляем план…' : plan ? 'Составить заново' : 'Предложить персональный план'}
    </button>
    {!moveDate && <small className="muted">Для расчёта сроков выберите дату переезда.</small>}
    {generating && <span role="status">Составление плана может занять до минуты. Проект пока не создаётся.</span>}
    <ErrorAlert message={error || undefined} />
    {plan && <div className="stack" aria-label="Предпросмотр плана">
      <h3>Проверьте ваш план</h3>
      <p className="muted">Измените или удалите лишнее. Задачи сохранятся при нажатии «Создать проект». Число дней считается от даты переезда: минус — до, плюс — после.</p>
      {plan.tasks.map((task, index) => <div className="planner-task stack" key={index}>
        <div className="stack">
          <label htmlFor={`${fieldId}-task-${index}`}>Задача {index + 1}</label>
          <textarea id={`${fieldId}-task-${index}`} rows={2} value={task.title} maxLength={200} required disabled={busy}
            onChange={(e) => editTask(index, { title: e.target.value })} />
        </div>
        <div className="planner-task-meta">
          <label>Этап
            <select value={task.stage} disabled={busy} onChange={(e) => {
              const stage = e.target.value as Stage
              editTask(index, { stage, offset_days: stage === 'moving_day' ? 0 : stage === 'before' ? Math.min(0, task.offset_days) : Math.max(0, task.offset_days) })
            }}>
              {Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Дней от переезда
            <input type="number" value={Number.isFinite(task.offset_days) ? task.offset_days : ''} required step={1} disabled={busy || task.stage === 'moving_day'}
              min={task.stage === 'before' ? -365 : 0} max={task.stage === 'after' ? 365 : 0}
              onChange={(e) => editTask(index, { offset_days: e.target.valueAsNumber })} />
          </label>
        </div>
        <button type="button" disabled={busy} onClick={() => onPlan(plan.tasks.length === 1 ? null : {
          ...plan, tasks: plan.tasks.filter((_, i) => i !== index),
        })}>Удалить задачу {index + 1}</button>
      </div>)}
      {plan.first_day.length > 0 && <h4>Взять в первый день</h4>}
      {plan.first_day.map((title, index) => <div className="planner-first-day" key={index}>
        <label>Предмет {index + 1}
          <input value={title} maxLength={200} required disabled={busy}
            onChange={(e) => onPlan({ ...plan, first_day: plan.first_day.map((t, i) => i === index ? e.target.value : t) })} />
        </label>
        <button type="button" aria-label={`Удалить предмет ${index + 1}`} disabled={busy}
          onClick={() => onPlan({ ...plan, first_day: plan.first_day.filter((_, i) => i !== index) })}>×</button>
      </div>)}
      <button type="button" disabled={busy} onClick={() => onPlan(null)}>Использовать только стандартный план</button>
    </div>}
  </section>
}
