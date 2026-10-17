import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

interface Props {
  title: string
  onClose: () => void
  /** Есть несохранённые изменения: перед закрытием спросим */
  dirty?: boolean
  children: ReactNode
  variant?: 'dialog' | 'drawer'
}

// Нативный <dialog>: фокус остаётся внутри окна, Escape и возврат фокуса работают из коробки,
// фон не кликается. Прокрутку фона блокирует класс no-scroll.
export default function Modal({ title, onClose, dirty = false, children, variant = 'dialog' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    // Фокус в первое поле формы (помечено data-autofocus): React фокусирует поле раньше, чем
    // dialog открыт, и такой фокус пропадает; без этого он оказывается на кнопке «Закрыть»
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    document.body.classList.add('no-scroll')
    return () => {
      if (dialog.open) dialog.close()
      const remaining = document.querySelector('dialog[open]')
      if (!remaining) document.body.classList.remove('no-scroll')
      if (previousFocus?.isConnected && (!remaining || remaining.contains(previousFocus))) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const requestClose = () => (dirty ? setConfirming(true) : onClose())

  return (
    <dialog
      ref={ref}
      className={`modal${variant === 'drawer' ? ' modal--drawer' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault() // Escape: решаем сами, чтобы не потерять введённое
        requestClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose() // клик по затемнению
      }}
    >
      <div className="modal-body">
        <button className="close" onClick={requestClose} aria-label="Закрыть">
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
        {children}
        {confirming && (
          <div className="confirm" role="alertdialog" aria-label="Подтверждение закрытия">
            <span>Есть несохранённые изменения. Закрыть без сохранения?</span>
            <div className="row">
              <button className="danger" onClick={onClose}>
                Закрыть
              </button>
              <button onClick={() => setConfirming(false)} autoFocus>
                Остаться
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
