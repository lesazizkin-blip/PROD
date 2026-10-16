import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/endpoints'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import { useProjects } from '../state/ProjectContext'
import { formatDate } from '../ui/format'
import StateView from '../ui/StateView'

/** Приглашение в проект: человек уже вошёл (иначе App показал бы экран входа), осталось присоединиться. */
export default function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { add, reload } = useProjects()
  const info = useAsync(() => api.inviteInfo(token), [token])
  const { busy, error, run } = useAction()

  const join = () =>
    run(async () => {
      const project = await api.acceptInvite(token)
      add({ id: project.id, name: project.name, role: 'member' })
      await reload()
      navigate('/')
    })

  return (
    <StateView loading={info.loading && !info.data} error={info.error} onRetry={info.reload}>
      {info.data ? (
        <div className="card stack narrow">
          <h2>Приглашение в проект</h2>
          <p>Вас пригласили в проект <b>«{info.data.project_name}»</b>. Вы увидите план, коробки и сможете отмечать статусы.</p>
          <p className="muted small">Ссылка действует до {formatDate(info.data.expires_at)}.</p>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <button className="primary" disabled={busy} onClick={join}>Присоединиться</button>
        </div>
      ) : null}
    </StateView>
  )
}
