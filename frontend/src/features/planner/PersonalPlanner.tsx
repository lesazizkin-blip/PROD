import { useId, useState } from 'react'
import { request, errorMessage } from '../../api/client'
import type { Stage } from '../../api/types'
import ErrorAlert from '../../ui/ErrorAlert'
import SpeechInput from './SpeechInput'
import type { PersonalPlan, PlanAnswer, PlanQuestion, PlanTask } from './types'
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
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  // шаг 1: уточняющие вопросы модели (null - ещё не спрашивали), ответы по id вопроса
  const [questions, setQuestions] = useState<PlanQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [stage, setStage] = useState<'questions' | 'plan' | null>(null)
  const fieldId = useId()
  const generating = stage !== null

  function changeDescription(value: string) {
    setDescription(value.slice(0, 4000))
    onPlan(null)
    setQuestions(null)
    setAnswers({})
    setError('')
  }

  async function call<T>(kind: 'questions' | 'plan', run: () => Promise<T>): Promise<T | null> {
    setError('')
    setStage(kind)
    onBusy(true)
    try {
      return await run()
    } catch (e) {
      setError(errorMessage(e))
      return null
    } finally {
      setStage(null)
      onBusy(false)
    }
  }

  const base = () => ({ description: description.trim(), move_date: moveDate, consent: true as const })

  // Шаг 2: план с ответами (пустые ответы не отправляем)
  async function buildPlan(withAnswers: boolean) {
    const given: PlanAnswer[] = withAnswers && questions
      ? questions.filter((q) => answers[q.id]?.trim()).map((q) => ({ question: q.question, answer: answers[q.id].trim() }))
      : []
    onPlan(null)
    const draft = await call('plan', () => request<PersonalPlan>('POST', '/projects/plan-preview', {
      body: given.length ? { ...base(), answers: given } : base(),
      timeoutMs: 70_000,
    }))
    if (draft) {
      setQuestions(null)
      onPlan(draft)
    }
  }

  // Шаг 1: сначала вопросы; если модели нечего уточнить - сразу план
  async function generate() {
    onPlan(null)
    const result = await call('questions', () => request<{ questions?: PlanQuestion[] }>('POST', '/projects/plan-questions', {
      body: base(),
      timeoutMs: 70_000,
    }))
    if (!result) return
    const list = Array.isArray(result.questions) ? result.questions : []
    if (list.length === 0) await buildPlan(false)
    else {
      setAnswers({})
      setQuestions(list)
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
    {questions ? null : <button type="button" onClick={generate}
      disabled={busy || listening || !consent || description.trim().length < 10 || !moveDate}>
      {stage === 'questions' ? 'Готовим вопросы…' : stage === 'plan' ? 'Составляем план…' : plan ? 'Составить заново' : 'Предложить персональный план'}
    </button>}
    {!moveDate && <small className="muted">Для расчёта сроков выберите дату переезда.</small>}
    {generating && <span role="status">{stage === 'questions' ? 'Подбираем уточняющие вопросы' : 'Составление плана может занять до минуты'}. Проект пока не создаётся.</span>}
    {questions && <div className="planner-questions stack" aria-label="Уточняющие вопросы">
      <h3>Уточним пару деталей</h3>
      <p className="muted">Ответы помогут сделать план точнее. Можно выбрать вариант, написать свой или пропустить.</p>
      {questions.map((q) => <fieldset key={q.id} className="planner-question stack">
        <legend>{q.question}</legend>
        {q.options.length > 0 && <div className="chips" role="group" aria-label={q.question}>
          {q.options.map((option) => <button key={option} type="button" disabled={busy}
            className={answers[q.id] === option ? 'chip on' : 'chip'} aria-pressed={answers[q.id] === option}
            onClick={() => setAnswers({ ...answers, [q.id]: answers[q.id] === option ? '' : option })}>{option}</button>)}
        </div>}
        <input aria-label={`Свой ответ: ${q.question}`} placeholder="Свой ответ" maxLength={200} disabled={busy}
          value={answers[q.id] ?? ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
      </fieldset>)}
      <div className="row wrap">
        <button type="button" className="primary" disabled={busy} onClick={() => buildPlan(true)}>
          {stage === 'plan' ? 'Составляем план…' : 'Составить план'}
        </button>
        <button type="button" disabled={busy} onClick={() => buildPlan(false)}>Пропустить вопросы</button>
      </div>
    </div>}
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
