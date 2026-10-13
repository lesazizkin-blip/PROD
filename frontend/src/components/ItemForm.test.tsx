import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ItemForm from './ItemForm'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const fillAndSubmit = async (title: string, amount: string) => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Название'), title)
  await user.type(screen.getByLabelText('Сумма, ₽'), amount)
  await user.click(screen.getByRole('button', { name: 'Создать' }))
}

describe('ItemForm', () => {
  it('не отправляет запрос с коротким названием и показывает ошибку у поля', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ItemForm onSaved={() => {}} onCancel={() => {}} />)
    await fillAndSubmit('ab', '100')
    expect(screen.getByText(/Минимум 3 символа/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('отклоняет нечисловую сумму', async () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<ItemForm onSaved={() => {}} onCancel={() => {}} />)
    await fillAndSubmit('Нормальное название', '12abc')
    expect(screen.getByText(/Целое число/)).toBeTruthy()
  })

  it('отправляет данные и сообщает родителю о сохранении', async () => {
    const saved = { id: 7, title: 'Кэшбэк', description: '', amount: 500 }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(saved), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<ItemForm onSaved={onSaved} onCancel={() => {}} />)
    await fillAndSubmit('Кэшбэк', '500')
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ title: 'Кэшбэк', amount: 500 })
  })

  it('ошибка сервера показывается, а не глотается молча', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    render(<ItemForm onSaved={() => {}} onCancel={() => {}} />)
    await fillAndSubmit('Кэшбэк', '500')
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('сообщает родителю о несохранённых правках', async () => {
    const onDirtyChange = vi.fn()
    render(<ItemForm onSaved={() => {}} onCancel={() => {}} onDirtyChange={onDirtyChange} />)
    await userEvent.setup().type(screen.getByLabelText('Название'), 'x')
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })
})
