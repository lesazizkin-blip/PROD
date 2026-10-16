import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { AuthProvider, useAuth } from '../state/AuthContext'
import AuthPage from './AuthPage'

const login = vi.fn()
const register = vi.fn()
const demoLogin = vi.fn()
vi.mock('../api/endpoints', () => ({
  api: {
    me: () => Promise.reject(new ApiError('Войдите', 401)),
    login: (...a: unknown[]) => login(...a),
    register: (...a: unknown[]) => register(...a),
    demoLogin: () => demoLogin(),
  },
}))

function Who() {
  const { user } = useAuth()
  return <div data-testid="who">{user === undefined ? 'проверяем' : (user?.username ?? 'никто')}</div>
}

async function setup() {
  render(<AuthProvider><Who /><AuthPage /></AuthProvider>)
  await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('никто'))
}

beforeEach(() => [login, register, demoLogin].forEach((f) => f.mockReset()))
afterEach(cleanup)

describe('вход и регистрация', () => {
  it('вход отправляет логин без пробелов и запоминает пользователя', async () => {
    login.mockResolvedValue({ id: 1, username: 'anna' })
    await setup()
    await userEvent.type(screen.getByLabelText('Логин'), ' anna ')
    await userEvent.type(screen.getByLabelText('Пароль'), 'секрет-секрет')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(login).toHaveBeenCalledWith({ username: 'anna', password: 'секрет-секрет' })
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('anna'))
  })

  it('неверный пароль показывает ошибку сервера', async () => {
    login.mockRejectedValue(new ApiError('Неверный логин или пароль', 401))
    await setup()
    await userEvent.type(screen.getByLabelText('Логин'), 'anna')
    await userEvent.type(screen.getByLabelText('Пароль'), 'не-тот')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Неверный логин или пароль')
  })

  it('регистрация требует пароль от 8 символов', async () => {
    register.mockResolvedValue({ id: 2, username: 'boris' })
    await setup()
    await userEvent.click(screen.getByRole('tab', { name: 'Регистрация' }))
    await userEvent.type(screen.getByLabelText('Логин'), 'boris')
    await userEvent.type(screen.getByLabelText('Пароль'), 'короткий'.slice(0, 7))
    const submit = screen.getByRole('button', { name: 'Создать аккаунт' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    await userEvent.type(screen.getByLabelText('Пароль'), 'й')
    expect(submit.disabled).toBe(false)
    await userEvent.click(submit)
    expect(register).toHaveBeenCalled()
  })

  it('демо открывается без регистрации', async () => {
    demoLogin.mockResolvedValue({ id: 3, username: 'demo' })
    await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Посмотреть демо без регистрации' }))
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('demo'))
  })
})
