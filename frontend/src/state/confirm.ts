import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  /** Текст кнопки подтверждения, по умолчанию «Удалить» */
  confirmLabel?: string
}

export type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>

// Без провайдера (например, в тестах) работает обычный системный диалог
export const ConfirmCtx = createContext<ConfirmFn>((o) => Promise.resolve(window.confirm([o.title, o.message].filter(Boolean).join('\n'))))

/** Подтверждение опасного действия в стиле сайта: `if (await confirm({ title: 'Удалить коробку?' })) …` */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx)
}
