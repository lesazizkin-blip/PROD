import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { useConfirm } from './confirm'
import { ConfirmProvider } from './ConfirmContext'

afterEach(cleanup)

// в jsdom у <dialog> нет showModal/close
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }

function Demo() {
  const confirm = useConfirm()
  const [answer, setAnswer] = useState('')
  return (
    <>
      <button onClick={async () => setAnswer(String(await confirm({ title: 'Удалить коробку № 3?', message: 'Вещи тоже удалятся.' })))}>удалить</button>
      <output>{answer}</output>
    </>
  )
}

describe('окно подтверждения', () => {
  it('показывает вопрос в стиле сайта и возвращает ответ', async () => {
    render(<ConfirmProvider><Demo /></ConfirmProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'удалить' }))
    expect(screen.getByRole('heading', { name: 'Удалить коробку № 3?' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('false'))
    await userEvent.click(screen.getByRole('button', { name: 'удалить' }))
    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('true'))
    expect(screen.queryByRole('heading', { name: 'Удалить коробку № 3?' })).toBeNull()
  })
})
