import { useEffect, useState } from 'react'

const keyFor = (userId: number) => `movermate.project-archive.v1.${userId}`
function read(userId: number): string[] {
  try { const ids: unknown = JSON.parse(localStorage.getItem(keyFor(userId)) ?? '[]'); return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [] } catch { return [] }
}

/** Only project IDs, scoped to this signed-in account and this browser. */
export function useLocalProjectArchive(userId: number) {
  const [state, setState] = useState(() => ({ userId, ids: read(userId) }))
  const ids = state.userId === userId ? state.ids : read(userId)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === keyFor(userId) || event.key === null) setState({ userId, ids: read(userId) }) }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [userId])
  function archive(id: string, archived: boolean) {
    const next = archived ? [...new Set([...ids, id])] : ids.filter(value => value !== id)
    setState({ userId, ids: next })
    try { localStorage.setItem(keyFor(userId), JSON.stringify(next)); setError(null) }
    catch { setError('Браузер не разрешил сохранить архив. Изменения будут видны только до закрытия страницы.') }
  }
  return { ids, archive, error }
}
