import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { ConfirmCtx, type ConfirmFn, type ConfirmOptions } from './confirm'

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => setPending({ ...o, resolve })), [])
  const close = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending ? <ConfirmDialog {...pending} onAnswer={close} /> : null}
    </ConfirmCtx.Provider>
  )
}

function ConfirmDialog({ title, message, confirmLabel = 'Удалить', onAnswer }: ConfirmOptions & { onAnswer: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className="modal confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault()
        onAnswer(false)
      }}
      onClick={(e) => {
        if (e.target === ref.current) onAnswer(false) // клик по затемнению
      }}
    >
      <div className="modal-body">
        <span className="confirm-dialog__icon" aria-hidden><TriangleAlert className="icon" /></span>
        <h2 id="confirm-title">{title}</h2>
        {message ? <p className="muted">{message}</p> : null}
        <div className="confirm-dialog__actions">
          <button type="button" onClick={() => onAnswer(false)} autoFocus>Отмена</button>
          <button type="button" className="danger-solid" onClick={() => onAnswer(true)}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
