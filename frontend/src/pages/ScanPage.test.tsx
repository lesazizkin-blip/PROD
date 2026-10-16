import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthContext'
import { ProjectProvider } from '../state/ProjectContext'
import ScanPage from './ScanPage'

vi.mock('html5-qrcode', () => ({ Html5Qrcode: vi.fn() }))
vi.mock('../api/endpoints', () => ({ api: { me: () => Promise.resolve({ id: 1, username: 'helper' }), myProjects: () => Promise.resolve([]) } }))

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('сканер', () => {
  it('открывается без выбранного проекта (новое устройство) и не просит создать проект', () => {
    render(<MemoryRouter><AuthProvider><ProjectProvider><ScanPage /></ProjectProvider></AuthProvider></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Сканер QR' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Создать проект' })).toBeNull()
    expect(screen.queryByLabelText('Или введите номер коробки')).toBeNull()
  })
})
