import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api } from '../../api/endpoints'
import PageHeading from '../../components/PageHeading'
import { useAuth } from '../../state/AuthContext'
import { useProjects } from '../../state/ProjectContext'
import { useAsync } from '../../state/useAsync'
import { STAGES, stagesFor, type JourneyStage } from './journeyStages'
import './journey.css'

const STATE_LABEL = { done: 'Сделано', active: 'В работе', todo: 'Впереди' } as const

/** Вся модель сервиса на одной странице: 7 этапов от решения о переезде до «обжились».
 *  У вошедшего с проектом - статус каждого этапа по его данным, у гостя - описание пути. */
export default function JourneyPage() {
  const { user } = useAuth()
  const { currentId } = useProjects()
  const pid = user ? currentId : null
  const data = useAsync(
    () => (pid
      ? Promise.all([api.getProject(pid), api.tasks(pid), api.progress(pid), api.budget(pid)])
        .then(([project, tasks, progress, budget]) => stagesFor({ project, tasks, progress, budget }))
      : Promise.resolve(null)),
    [pid],
  )
  const stages: JourneyStage[] = data.data ?? STAGES
  const done = stages.filter((s) => s.state === 'done').length
  const current = stages.find((s) => s.state !== 'done' && s.state)

  return (
    <div className="stack journey">
      <PageHeading title="Путь переезда">От решения «пора переезжать» до «мы обжились» — 7 этапов, и на каждом понятно, что делать.</PageHeading>
      {data.data ? (
        <div className="move-ticket">
          <div className="stack">
            <span className="eyebrow">Ваш переезд</span>
            <h2>{done === stages.length ? 'Переезд завершён' : `Этап ${current?.n ?? 1}: ${current?.title ?? stages[0].title}`}</h2>
            <p className="small">{current?.question ?? 'Все этапы пройдены.'}</p>
          </div>
          <div className="date-stamp date-stamp--tape"><strong className="date-stamp__dates">{done} / {stages.length}</strong><span className="date-stamp__caption">ЭТАПОВ ПРОЙДЕНО</span></div>
        </div>
      ) : null}
      <ol className="journey-steps">
        {stages.map((s) => (
          <li key={s.n} className={`journey-step ${s.state ?? 'todo'}${s === current ? ' current' : ''}`}>
            <span className="journey-step__n" aria-hidden>{s.state === 'done' ? <Check className="icon-sm" /> : String(s.n).padStart(2, '0')}</span>
            <div className="stack journey-step__body">
              <div className="row between">
                <h2>{s.title}</h2>
                {s.state ? <span className={`badge journey-badge ${s === current ? 'current' : s.state}`}>{s === current ? 'Сейчас' : STATE_LABEL[s.state]}</span> : null}
              </div>
              <p className="journey-step__q">{s.question}</p>
              <p className="muted small">{s.does}</p>
              {s.detail ? <p className="journey-step__detail">{s.detail}</p> : null}
              <div className="row wrap">
                {s.actions.map((a) => (
                  user || a.to === '/calculator'
                    ? <Link key={a.to + a.label} to={a.to === '/projects' && pid ? `/projects/${pid}/settings` : a.to} className={s === current ? 'button primary small' : 'button small'}>{a.label} →</Link>
                    : null
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {!user ? (
        <div className="row wrap">
          <Link to="/auth?mode=register" className="button primary">Начать свой переезд</Link>
          <Link to="/calculator" className="button">Сначала рассчитать</Link>
        </div>
      ) : null}
    </div>
  )
}
