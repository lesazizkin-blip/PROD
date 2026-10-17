import { useEffect, useRef, useState } from 'react'

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

export default function SpeechInput({ onText, disabled, onListening }: {
  onText: (text: string) => void
  disabled: boolean
  onListening: (listening: boolean) => void
}) {
  const recognition = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const speechWindow = window as SpeechWindow
  const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition

  useEffect(() => () => {
    const current = recognition.current
    if (current) {
      current.onresult = null
      current.onerror = null
      current.onend = null
      current.abort()
    }
  }, [])

  function toggle() {
    if (recognition.current) {
      recognition.current.stop()
      return
    }
    if (!Constructor) return
    setError('')
    const current = new Constructor()
    recognition.current = current
    current.lang = 'ru-RU'
    current.continuous = false
    current.interimResults = false
    current.onresult = (event) => {
      const text = Array.from(event.results).filter((result) => result.isFinal)
        .map((result) => result[0].transcript).join(' ')
      if (text.trim()) onText(text.trim())
    }
    current.onerror = (event) => {
      setError(event.error === 'not-allowed'
        ? 'Нет доступа к микрофону. Разрешите его в браузере или введите текст.'
        : 'Не удалось распознать речь. Попробуйте ещё раз или введите текст.')
    }
    current.onend = () => {
      recognition.current = null
      setListening(false)
      onListening(false)
    }
    try {
      current.start()
      setListening(true)
      onListening(true)
    } catch {
      recognition.current = null
      setError('Микрофон недоступен. Введите пожелания текстом.')
    }
  }

  return <div className="stack">
    <button type="button" className="planner-mic" onClick={toggle}
      disabled={!Constructor || disabled} aria-pressed={listening}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
      </svg>
      {listening ? 'Остановить запись' : 'Продиктовать пожелания'}
    </button>
    <small className="muted">{Constructor
      ? 'Нажимая микрофон, вы разрешаете распознавание речи средствами браузера. Аудио может обрабатываться его внешним сервисом. Проверьте текст перед генерацией.'
      : 'В этом браузере диктовка недоступна. Введите текст или используйте микрофон экранной клавиатуры.'}</small>
    {listening && <span role="status">Слушаю… Распознанный текст появится в поле.</span>}
    {error && <span role="alert">{error}</span>}
  </div>
}
