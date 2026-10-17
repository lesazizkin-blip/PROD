import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'
import StateView from '../ui/StateView'

// Памятки лежат в БД сервера (раздел 5.5 ТЗ): хранятся локально, без внешних источников. Основное место - вкладка «Прогресс».
export default function TipsPage() {
  const tips = useAsync(() => api.tips(), [])
  const list = tips.data ?? []
  return (
    <StateView loading={tips.loading} error={tips.error} empty={list.length === 0} emptyText="Памяток пока нет" onRetry={tips.reload}>
      <h2>Памятка</h2>
      <div className="stack">
        {list.map((t) => (
          <article key={t.id} className="card">
            <h3>{t.title}</h3>
            <p>{t.body}</p>
          </article>
        ))}
      </div>
    </StateView>
  )
}
