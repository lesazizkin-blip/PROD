import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Поменять данные на экране сразу, не дожидаясь сервера (мгновенный отклик на клик) */
  mutate: (update: (data: T | null) => T | null) => void
}

/** Загрузка данных для экрана: состояния «загрузка / ошибка / данные» и повторная попытка. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], { refreshOnFocus = false } = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  // Другие параметры (другой проект, другой запрос) - старые данные больше не верны и прячутся сразу;
  // обычный reload() данные оставляет, чтобы экран не мигал
  const key = JSON.stringify(deps)
  const keyRef = useRef(key)

  useEffect(() => {
    let cancelled = false
    if (keyRef.current !== key) {
      keyRef.current = key
      setData(null)
    }
    setLoading(true)
    setError(null)
    fnRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(errorMessage(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!refreshOnFocus) return
    let lastRefresh = -Infinity
    const refresh = () => {
      if (document.hidden || performance.now() - lastRefresh < 1000) return
      lastRefresh = performance.now()
      reload()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [refreshOnFocus, reload])
  const mutate = useCallback((update: (data: T | null) => T | null) => setData(update), [])
  return { data, loading, error, reload, mutate }
}
