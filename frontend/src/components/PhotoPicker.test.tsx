import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PhotoPicker from './PhotoPicker'

vi.mock('../ui/photo', () => ({ photoToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,AAAA') }))

afterEach(cleanup)

describe('фото для ИИ', () => {
  it('без галочки согласия фото не выбрать и не отправить', async () => {
    const onPhoto = vi.fn(async () => {})
    const { container } = render(<PhotoPicker label="Заполнить по фото" busyLabel="…" onPhoto={onPhoto} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    expect(input.disabled).toBe(true)
    expect(screen.getByText('Заполнить по фото').closest('label')?.getAttribute('aria-disabled')).toBe('true')

    await userEvent.click(screen.getByRole('checkbox'))
    expect(input.disabled).toBe(false)
    fireEvent.change(input, { target: { files: [new File(['x'], 'box.jpg', { type: 'image/jpeg' })] } })
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA'))
  })

  it('ошибка сервера видна пользователю', async () => {
    const { container } = render(<PhotoPicker label="Фото" busyLabel="…" onPhoto={async () => { throw new Error('Лимит AI на этот час исчерпан') }} />)
    await userEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Лимит AI на этот час исчерпан')
  })
})
