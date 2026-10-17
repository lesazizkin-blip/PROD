import { api } from '../../api/endpoints'
import { useProjects } from '../../state/ProjectContext'
import { useAsync } from '../../state/useAsync'
import { useAction } from '../../state/useAction'
import ErrorAlert from '../../ui/ErrorAlert'
import type { QrMode } from './contract'

export default function QrModeSettings({ pid, onSaved }: { pid: string; onSaved: () => void }) {
  const { projects } = useProjects()
  const project = useAsync(() => api.getProject(pid), [pid], { refreshOnFocus: true })
  const { busy, error, run } = useAction(() => { project.reload(); onSaved() })
  const mode = project.data?.qr_mode
  const owner = projects.find(p => p.id === pid)?.role === 'owner'
  if (import.meta.env.VITE_COMPACT_QR_ENABLED === 'false') return null
  if (!mode) return project.error ? <ErrorAlert message={project.error} /> : null
  return <section className="card stack no-print" aria-label="Формат QR проекта">
    <h2>QR-коды проекта</h2>
    <label>Способ сканирования
      <select value={mode} disabled={!owner || busy} onChange={e => {
        const qr_mode = e.target.value as QrMode
        void run(() => api.updateProject(pid, { qr_mode }))
      }}>
        <option value="universal">Универсальный — обычной камерой телефона</option>
        <option value="compact">Компактный — сканером MoverMate</option>
      </select>
    </label>
    <p>{mode === 'compact'
      ? 'В QR хранится короткий код. Откройте MoverMate и нажмите «Сканировать QR».'
      : 'В QR хранится ссылка. Наведите обычную камеру телефона или сканер MoverMate.'}</p>
    <p className="small muted">Настройка общая для проекта. Уже распечатанные этикетки обоих форматов продолжают работать. Размер на бумаге выбирается ниже.</p>
    {!owner ? <p className="small">Изменить формат может владелец проекта.</p> : null}
    <ErrorAlert message={error ?? project.error} />
  </section>
}
