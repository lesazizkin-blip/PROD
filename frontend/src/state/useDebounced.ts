import { useEffect, useState } from 'react'

/** Значение с задержкой: поиск идёт после паузы в наборе, а не на каждую букву. */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
