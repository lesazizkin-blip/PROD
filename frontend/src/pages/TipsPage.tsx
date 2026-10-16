import { api } from '../api/endpoints'
import type { TipTopic } from '../api/types'
import { useAsync } from '../state/useAsync'
import SectionTitle from '../ui/SectionTitle'
import StateView from '../ui/StateView'

const TOPICS: { topic: TipTopic; title: string }[] = [
  { topic: 'fragile', title: 'Хрупкие вещи' },
  { topic: 'carry_with_you', title: 'Берём с собой' },
  { topic: 'pack_last', title: 'Пакуем последними' },
]

// Памятки лежат в БД сервера (раздел 5.5 ТЗ): хранятся локально, без внешних источников.
export default function TipsPage() {
  const tips = useAsync(() => api.tips(), [])
  const list = tips.data ?? []
  return (
    <StateView loading={tips.loading} error={tips.error} empty={list.length === 0} emptyText="Памяток пока нет" onRetry={tips.reload}>
      <h2>Памятки</h2>
      {TOPICS.map(({ topic, title }) => (
        <section key={topic} className="stack">
          <SectionTitle>{title}</SectionTitle>
          {list.filter((t) => t.topic === topic).map((t) => (
            <article key={t.id} className="card">
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </section>
      ))}
    </StateView>
  )
}
