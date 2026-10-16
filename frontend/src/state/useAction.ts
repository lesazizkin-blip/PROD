import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'

/**
 * Действие по кнопке или отправка формы: пока запрос идёт, второй клик игнорируется,
 * `busy` блокирует кнопки, ошибка сервера попадает в `error`. После успеха вызывается `onDone` (обычно перезагрузка).
 * `submit(action)` - готовый обработчик `onSubmit` для формы.
 */
export function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await action()
      onDoneRef.current?.()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const submit = useCallback(
    (action: () => Promise<unknown>) => (e: FormEvent) => {
      e.preventDefault()
      void run(action)
    },
    [run],
  )

  return { busy, error, setError, run, submit }
}
