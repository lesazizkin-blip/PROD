import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import StatusPickerModal, { type StatusOption } from './StatusPickerModal'

afterEach(cleanup)

// в jsdom у <dialog> нет showModal/close
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }

type S = 'a' | 'b' | 'c'
const options: StatusOption<S>[] = [
  { value: 'a', label: 'Первый', badge: 'st-packing' },
  { value: 'b', label: 'Второй', badge: 'st-packed', hint: 'Следующий шаг' },
  { value: 'c', label: 'Третий', badge: 'st-loaded', hint: 'Сначала «Второй»', disabled: true },
]

describe('окно выбора статуса', () => {
  it('текущий и недоступный нельзя выбрать, доступный сохраняется и окно закрывается', async () => {
    const onPick = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    render(<StatusPickerModal title="Статус" current="a" options={options} onPick={onPick} onClose={onClose} />)

    expect((screen.getByRole('button', { name: /^Первый/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: /^Первый/ }).getAttribute('aria-current')).toBe('true')
    expect((screen.getByRole('button', { name: /^Третий/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Сначала «Второй»')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /^Второй/ }))
    expect(onPick).toHaveBeenCalledWith('b')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('ошибка сервера остаётся в окне', async () => {
    const onPick = vi.fn().mockRejectedValue(new ApiError('Коробка пуста', 409, 'conflict'))
    const onClose = vi.fn()
    render(<StatusPickerModal title="Статус" current="a" options={options} onPick={onPick} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /^Второй/ }))
    expect(await screen.findByText(/Коробка пуста/)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
