import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { BoxAdvice, BoxCard } from '../../api/types'
import { api } from '../../api/endpoints'
import { useAuth } from '../../state/AuthContext'
import { useAction } from '../../state/useAction'
import ErrorAlert from '../../ui/ErrorAlert'

// Only memory in this tab, scoped to user and exact inventory. No stored inventory in localStorage.
const adviceCache = new Map<string, BoxAdvice>()
const basisFor = (box: BoxCard) => JSON.stringify([box.room, box.status, box.items.map(i => [i.id, i.name, i.quantity ?? 1, i.first_day, i.lost, i.damaged ?? false])])

export default function BoxAdvicePanel({ box, disabled, onRefresh }: { box: BoxCard; disabled: boolean; onRefresh: () => void }) {
  const { user } = useAuth()
  const basis = basisFor(box)
  const scope = `${user?.id}/${box.project_id}/${box.number}/`
  const key = scope + basis
  const [result, setResult] = useState<{ scope: string; advice: BoxAdvice } | null>(() => { const cached = adviceCache.get(key); return cached ? { scope, advice: cached } : null })
  const [requestBasis, setRequestBasis] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const advice = result?.scope === scope && result.advice.basis === basis ? result.advice : adviceCache.get(key)
  const stale = result?.scope === scope && result.advice.basis !== basis
  async function generate() {
    if (!user || !box.items.length || disabled || busy) return
    setRequestBasis(basis)
    await run(async () => {
      const value = await api.boxAdvice(box.project_id, box.number)
      if (adviceCache.size >= 30) adviceCache.delete(adviceCache.keys().next().value!)
      adviceCache.set(scope + value.basis, value)
      setResult({ scope, advice: value })
      if (value.basis !== basis) onRefresh()
    })
  }
  return <aside className="box-advice" aria-labelledby="box-advice-heading">
    <div className="box-advice__heading"><Sparkles className="icon" aria-hidden /><h2 id="box-advice-heading">Советы по коробке</h2><span className="box-advice__badge">ИИ</span></div>
    {!box.items.length ? <p className="muted small">Добавьте вещи в опись — подберём советы по упаковке и перевозке.</p> : <>
      {advice ? <ul className="box-advice__tips">{advice.tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul> : <p className="muted small">{stale ? 'Опись или статус изменились. Обновите советы для этой коробки.' : 'Подскажем, как защитить вещи, что держать под рукой и в каком порядке разбирать.'}</p>}
      {busy ? <p className="muted small" role="status">Подбираем советы по описи…</p> : null}
      <ErrorAlert message={requestBasis === basis ? error : null} />
      <button type="button" onClick={() => void generate()} disabled={disabled || busy || !user}>{busy ? 'Подбираем…' : advice ? 'Обновить советы' : 'Получить советы'}</button>
      <p className="box-advice__privacy">По нажатию ИИ получит опись и статус коробки.</p>
    </>}
  </aside>
}
