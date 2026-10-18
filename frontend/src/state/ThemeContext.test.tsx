import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'

let dark = false
let changed: (() => void) | undefined
function Controls() {
  const { preference, theme, setPreference } = useTheme()
  return <><output>{preference}/{theme}</output><button onClick={() => setPreference('light')}>light</button><button onClick={() => setPreference('dark')}>dark</button><button onClick={() => setPreference('system')}>system</button></>
}
const setup = () => render(<ThemeProvider><Controls /></ThemeProvider>)
beforeEach(() => {
  localStorage.clear(); dark = false; changed = undefined
  vi.stubGlobal('matchMedia', () => ({ get matches() { return dark }, addEventListener: (_: string, fn: () => void) => { changed = fn }, removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete document.documentElement.dataset.theme })

describe('theme preference', () => {
  it('follows the device until an explicit choice, and resumes when system is selected', () => {
    setup()
    expect(screen.getByRole('status').textContent).toBe('system/light')
    act(() => { dark = true; changed?.() })
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    act(() => { dark = false; changed?.(); dark = true; changed?.() })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('movermate.theme.v1')).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'system' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it('restores the saved choice and follows changes and resets in another tab', () => {
    localStorage.setItem('movermate.theme.v1', 'dark'); setup()
    expect(document.documentElement.dataset.theme).toBe('dark')
    act(() => { localStorage.setItem('movermate.theme.v1', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'movermate.theme.v1' })) })
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => { localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', { key: null })) })
    expect(screen.getByRole('status').textContent).toBe('system/light')
  })
  it('ignores a corrupted preference and works when browser storage is blocked', () => {
    localStorage.setItem('movermate.theme.v1', 'unexpected'); dark = true; setup()
    expect(document.documentElement.dataset.theme).toBe('dark')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    fireEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
