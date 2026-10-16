import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StateView from './StateView'

afterEach(cleanup)

describe('StateView', () => {
  it('загрузка: индикатор вместо содержимого', () => {
    render(<StateView loading error={null}>контент</StateView>)
    expect(screen.getByRole('status').textContent).toContain('Загрузка')
    expect(screen.queryByText('контент')).toBeNull()
  })

  it('ошибка: текст и кнопка «Повторить»', async () => {
    const retry = vi.fn()
    render(<StateView loading={false} error="Нет связи с сервером" onRetry={retry}>контент</StateView>)
    expect(screen.getByRole('alert').textContent).toContain('Нет связи с сервером')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('пусто: подпись вместо содержимого', () => {
    render(<StateView loading={false} error={null} empty emptyText="Коробок пока нет">контент</StateView>)
    expect(screen.getByText('Коробок пока нет')).toBeTruthy()
    expect(screen.queryByText('контент')).toBeNull()
  })

  it('данные есть: показываем содержимое', () => {
    render(<StateView loading={false} error={null}>контент</StateView>)
    expect(screen.getByText('контент')).toBeTruthy()
  })

  it('ошибка важнее «пусто»', () => {
    render(<StateView loading={false} error="Сбой" empty>контент</StateView>)
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
