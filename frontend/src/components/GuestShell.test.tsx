import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import GuestShell from './GuestShell'

afterEach(cleanup)

describe('гость', () => {
  it('разделы не открываются, а просят зарегистрироваться; внизу слева кнопка регистрации', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<GuestShell />}>
            <Route path="*" element={<p>о нас</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Коробки' }))
    expect(screen.getByRole('alert').textContent).toMatch(/доступен после регистрации/)
    expect(screen.getByText('о нас')).toBeTruthy() // страница не сменилась
    expect(screen.getAllByRole('link', { name: 'Регистрация' })[0].getAttribute('href')).toBe('/auth?mode=register')
  })
})
