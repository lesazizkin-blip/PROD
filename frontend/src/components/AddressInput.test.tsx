import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const config = vi.fn()
vi.mock('../api/endpoints', () => ({ api: { config: () => config() } }))

afterEach(() => {
  cleanup()
  vi.resetModules()
})

function Field() {
  const [v, setV] = useState('')
  return <AddressInputLazy label="Куда" value={v} onChange={setV} />
}
let AddressInputLazy: typeof import('./AddressInput').default

describe('поле адреса', () => {
  it('без ключа Google - обычное поле, в Google ничего не уходит', async () => {
    config.mockResolvedValue({ maps_api_key: null })
    AddressInputLazy = (await import('./AddressInput')).default
    render(<Field />)
    await userEvent.type(screen.getByLabelText('Куда'), 'Лесная 12')
    expect((screen.getByLabelText('Куда') as HTMLInputElement).value).toBe('Лесная 12')
    expect(screen.queryByRole('button', { name: /Найти на карте/ })).toBeNull()
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull()
  })

  it('с ключом - кнопка «Найти на карте», скрипт Google грузится только после нажатия', async () => {
    config.mockResolvedValue({ maps_api_key: 'browser-key' })
    AddressInputLazy = (await import('./AddressInput')).default
    render(<Field />)
    const button = await screen.findByRole('button', { name: /Найти на карте/ })
    expect(document.querySelector('script[src*="maps.googleapis.com"]')).toBeNull()
    await userEvent.click(button)
    expect(document.querySelector('script[src*="maps.googleapis.com"]')?.getAttribute('src')).toContain('key=browser-key')
  })
})
