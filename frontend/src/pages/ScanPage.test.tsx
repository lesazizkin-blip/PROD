import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectProvider } from '../state/ProjectContext'
import ScanPage from './ScanPage'

vi.mock('html5-qrcode', () => ({ Html5Qrcode: vi.fn() }))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('сканер', () => {
  it('открывается без выбранного проекта (новое устройство) и не просит создать проект', () => {
    render(<MemoryRouter><ProjectProvider><ScanPage /></ProjectProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Сканер QR' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать проект' })).toBeNull()
    expect(screen.queryByLabelText('Или введите номер коробки')).toBeNull()
  })
})
