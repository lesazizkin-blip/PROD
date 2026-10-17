import { api } from '../api/endpoints'
import type { Tip } from '../api/types'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

/** Карточки памятки (раздел 5.5 ТЗ). Основное место - вкладка «Прогресс». */
export function TipList({ tips }: { tips: Tip[] }) {
  return (
    <div className="stack">
      {tips.map((t) => (
        <article key={t.id} className="card">
          <h3>{t.title}</h3>
          <p>{t.body}</p>
        </article>
      ))}
    </div>
  )
}

// Памятки лежат в БД сервера: хранятся локально, без внешних источников.
export default function TipsPage() {
  const tips = useAsync(() => api.tips(), [])
  const list = tips.data ?? []
  return (
    <StateView loading={tips.loading} error={tips.error} empty={list.length === 0} emptyText="Памяток пока нет" onRetry={tips.reload}>
      <h2>Памятка</h2>
      <TipList tips={list} />
    </StateView>
  )
}
