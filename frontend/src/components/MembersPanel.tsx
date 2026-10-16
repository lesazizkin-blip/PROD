import { useState } from 'react'
import { api } from '../api/endpoints'
import type { User } from '../api/types'
import type { SavedProject } from '../state/projects'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'

/** «Помощники» в окне проектов: кто в проекте, приглашение по ссылке, отзыв ссылок, выход из проекта. */
export default function MembersPanel({ project, me, onLeft }: { project: SavedProject; me: User; onLeft: () => void }) {
  const isOwner = project.role === 'owner'
  const members = useAsync(() => api.members(project.id), [project.id])
  const action = useAction(() => members.reload())
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const makeInvite = () =>
    action.run(async () => {
      const { path } = await api.createInvite(project.id)
      setInviteUrl(`${window.location.origin}${path}`)
      setNote(null)
    })

  async function copyInvite() {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNote('Ссылка скопирована')
    } catch {
      setNote('Скопируйте ссылку вручную') // буфер обмена недоступен (нет HTTPS или запрет браузера)
    }
  }

  const revoke = () => {
    if (!window.confirm('Отозвать все ссылки-приглашения? Те, кто уже в проекте, останутся.')) return
    void action.run(async () => {
      const { revoked } = await api.revokeInvites(project.id)
      setInviteUrl(null)
      setNote(revoked ? `Отозвано ссылок: ${revoked}` : 'Активных ссылок не было')
    })
  }

  const remove = (userId: number, username: string) => {
    const self = userId === me.id
    if (!window.confirm(self ? `Выйти из проекта «${project.name}»?` : `Убрать ${username} из проекта?`)) return
    void action.run(async () => {
      await api.removeMember(project.id, userId)
      if (self) onLeft()
    })
  }

  return (
    <section className="stack invite" aria-labelledby="members-title">
      <h3 id="members-title">Помощники</h3>
      {members.data ? (
        <ul className="plain members">
          {members.data.map((m) => (
            <li key={m.user_id} className="row between">
              <span>
                <b>{m.username}</b>
                <span className="muted small">{m.role === 'owner' ? ' · владелец' : ' · участник'}{m.user_id === me.id ? ' (вы)' : ''}</span>
              </span>
              {m.role === 'member' && (isOwner || m.user_id === me.id) ? (
                <button className="link small" disabled={action.busy} onClick={() => remove(m.user_id, m.username)}>
                  {m.user_id === me.id ? 'Выйти из проекта' : 'Убрать'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : members.error ? <ErrorAlert message={members.error} /> : <span className="muted small">Загрузка…</span>}

      {isOwner ? (
        <>
          <p className="muted small">Пригласите грузчика или родных: по ссылке они войдут в «{project.name}» и смогут отмечать коробки. Ссылка действует 7 дней.</p>
          {inviteUrl ? (
            <div className="row">
              <input className="grow" value={inviteUrl} readOnly aria-label="Ссылка-приглашение" onFocus={(e) => e.currentTarget.select()} />
              <button className="tonal" onClick={() => void copyInvite()}>Копировать</button>
            </div>
          ) : (
            <button className="tonal" disabled={action.busy} onClick={() => void makeInvite()}>Пригласить по ссылке</button>
          )}
          <button className="link small invite__revoke" disabled={action.busy} onClick={revoke}>Отозвать все ссылки</button>
        </>
      ) : null}
      {note ? <p className="muted small" role="status">{note}</p> : null}
      <ErrorAlert message={action.error} />
    </section>
  )
}
