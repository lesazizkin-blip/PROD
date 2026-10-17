import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import GuestShell from './GuestShell'

afterEach(cleanup)

// в jsdom у <dialog> нет showModal/close
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }

describe('гость', () => {
  it('разделы не открываются, а просят зарегистрироваться; кнопок регистрации в шапке и внизу слева нет', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<GuestShell />}>
            <Route path="*" element={<p>о нас</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Коробки и поиск' }))
    expect(screen.getByRole('alert').textContent).toMatch(/доступен после регистрации/)
    expect(screen.getByText('о нас')).toBeTruthy() // страница не сменилась
    expect(screen.queryByRole('link', { name: 'Регистрация' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/auth')
    await userEvent.click(screen.getByRole('button', { name: 'Вопросы' }))
    expect(screen.getByRole('heading', { name: 'Вопросы и ответы' })).toBeTruthy()
    expect(screen.getByText('Нужно ли что-то устанавливать?')).toBeTruthy()
  })
})
