import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import ScanPage from './ScanPage'

const h = vi.hoisted(() => ({
  pid: '11111111-1111-4111-8111-111111111111' as string | null,
  navigate: vi.fn(), getBox: vi.fn(), start: vi.fn(), stop: vi.fn(), clear: vi.fn(),
  scans: [] as ((text: string) => void)[],
}))
vi.mock('../state/ProjectContext', () => ({ useProjects: () => ({ currentId: h.pid, projects: h.pid ? [{ id: h.pid, name: 'Переезд' }] : [] }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }))
vi.mock('../api/endpoints', () => ({ api: { getBox: h.getBox } }))
vi.mock('../features/recognition/crop', async (original) => ({
  ...await original<typeof import('../features/recognition/crop')>(),
  cropPhoto: vi.fn(async (photo: Blob) => photo),
}))
vi.mock('html5-qrcode', () => ({ Html5Qrcode: class {
  isScanning = false
  async start(_camera: unknown, _config: unknown, onScan: (text: string) => void) {
    h.scans.push(onScan)
    await h.start()
    this.isScanning = true
    return null
  }
  async stop() { await h.stop(); this.isScanning = false }
  clear() { h.clear() }
} }))
const pid = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const url = `https://old.example/projects/${other}/boxes/7`
const code = 'MM1:ABCDEFGH234567AB'
const ready = () => waitFor(() => expect(screen.getByRole('status').textContent).toContain('Готово'))
const scan = (text: string) => act(() => { h.scans.at(-1)!(text) })
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r }); return { promise, resolve } }

beforeEach(() => {
  sessionStorage.clear()
  h.pid = pid; h.scans.length = 0
  h.navigate.mockReset(); h.getBox.mockReset().mockResolvedValue({ room: 'Кухня' })
  h.start.mockReset().mockResolvedValue(null); h.stop.mockReset().mockResolvedValue(undefined); h.clear.mockReset()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  vi.stubGlobal('URL', URL)
  URL.createObjectURL = vi.fn(() => 'blob:local-photo')
  URL.revokeObjectURL = vi.fn()
})
afterEach(async () => { cleanup(); await act(async () => { await Promise.resolve() }); vi.unstubAllGlobals() })

describe('сканер: настоящие callbacks, тестовые camera/API adapters', () => {
  it('без проекта принимает старый QR и только один callback', async () => {
    h.pid = null
    render(<StrictMode><ScanPage /></StrictMode>); await ready()
    scan(url); scan(url)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${other}/boxes/7`))
    expect(h.navigate).toHaveBeenCalledTimes(1)
    expect(h.getBox).toHaveBeenCalledTimes(1)
    expect(h.getBox).toHaveBeenCalledWith(other, 7)
    expect(screen.queryByLabelText('Или введите номер коробки')).toBeNull()
    expect(h.stop).toHaveBeenCalledTimes(1)
  })
  it('короткий QR вызывает resolver независимо от выбранного проекта', async () => {
    const resolveCode = vi.fn().mockResolvedValue({ project_id: other, box_number: 4 })
    render(<ScanPage resolveCode={resolveCode} />); await ready(); scan(code); scan(code)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${other}/boxes/4`))
    expect(resolveCode).toHaveBeenCalledExactlyOnceWith(code)
  })
  it('не вызывает отсутствующий resolver и не выдумывает коробку', async () => {
    render(<ScanPage />); await ready(); scan(code)
    expect(screen.getByText(/Компактные QR пока недоступны/)).toBeTruthy()
    expect(h.getBox).not.toHaveBeenCalled()
  })
  it('мусор не останавливает сканирование, следующий QR работает', async () => {
    render(<ScanPage />); await ready(); scan('MM1:bad')
    expect(screen.getByText(/Это не QR-код/)).toBeTruthy(); scan(url)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1))
  })
  it.each([
    [new ApiError('offline', 0), 'offline'],
    [new ApiError('missing', 404), 'Коробка не найдена'],
    [new ApiError('forbidden', 403), 'Нет доступа'],
  ])('ошибка проверки %s видна и допускает повтор', async (failure, message) => {
    h.getBox.mockRejectedValueOnce(failure)
    render(<ScanPage />); await ready(); scan(url)
    await screen.findByText(new RegExp(message)); expect(h.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Запустить QR снова' })); await ready(); scan(url)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledTimes(1))
  })
  it('сохраняет адрес старого QR при 401 для входа', async () => {
    h.getBox.mockRejectedValueOnce(new ApiError('login', 401))
    render(<ScanPage />); await ready(); scan(url)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${other}/boxes/7`))
  })
  it('отказ камеры и повторное разрешение', async () => {
    h.start.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
    render(<ScanPage />); await screen.findByText(/Доступ к камере запрещён/)
    fireEvent.click(screen.getByRole('button', { name: 'Запустить QR снова' })); await ready()
    expect(h.start).toHaveBeenCalledTimes(2)
  })
  it('уход во время старта освобождает поток до следующего старта', async () => {
    const pending = deferred<null>(); h.start.mockReturnValueOnce(pending.promise)
    const first = render(<ScanPage />)
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1))
    const oldCallback = h.scans[0]
    first.unmount(); render(<ScanPage />)
    await act(async () => { await Promise.resolve() })
    expect(h.start).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve(null) }); await ready()
    expect(h.stop).toHaveBeenCalledTimes(1)
    act(() => oldCallback(url)); expect(h.navigate).not.toHaveBeenCalled()
  })
  it('не переходит по запоздалому resolver после ухода', async () => {
    const pending = deferred<{ project_id: string; box_number: number }>()
    const resolveCode = vi.fn(() => pending.promise)
    const page = render(<ScanPage resolveCode={resolveCode} />); await ready(); scan(code)
    await waitFor(() => expect(resolveCode).toHaveBeenCalledTimes(1)); page.unmount()
    await act(async () => { pending.resolve({ project_id: other, box_number: 4 }) })
    expect(h.navigate).not.toHaveBeenCalled(); expect(h.getBox).not.toHaveBeenCalled()
  })
  it('после 401 resolver сохраняет код и возобновляет после входа', async () => {
    const resolveCode = vi.fn().mockRejectedValueOnce(new ApiError('login', 401)).mockResolvedValue({ project_id: other, box_number: 5 })
    const page = render(<ScanPage resolveCode={resolveCode} />); await ready(); scan(code)
    await screen.findByText('Войдите, чтобы открыть коробку.')
    page.unmount()
    render(<StrictMode><ScanPage resolveCode={resolveCode} /></StrictMode>)
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${other}/boxes/5`))
    expect(resolveCode).toHaveBeenCalledTimes(2)
    expect(sessionStorage.length).toBe(0)
  })
  it('фон останавливает камеру; возврат требует повторного запуска', async () => {
    render(<ScanPage />); await ready()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    fireEvent(document, new Event('visibilitychange'))
    await waitFor(() => expect(h.stop).toHaveBeenCalledTimes(1))
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    fireEvent(document, new Event('visibilitychange'))
    expect(h.start).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Запустить QR снова' })); await ready()
    expect(h.start).toHaveBeenCalledTimes(2)
  })
  it('ручной #001 проверяет текущий проект, мусор отклоняется', async () => {
    render(<ScanPage />); await ready()
    const input = screen.getByLabelText('Или введите номер коробки')
    fireEvent.change(input, { target: { value: '1e2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и открыть' }))
    expect(screen.getByText(/Введите положительный номер целиком/)).toBeTruthy()
    fireEvent.change(input, { target: { value: ' #001 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и открыть' }))
    await waitFor(() => expect(h.getBox).toHaveBeenCalledWith(pid, 1))
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${pid}/boxes/1`))
  })
  it('фото останавливает QR; кандидаты требуют выбора и свежего подтверждения', async () => {
    const recognizeHandwriting = vi.fn().mockResolvedValue({ text: '#001\n002', candidates: ['#001', '002'], diagnostics: { engine: 'test', elapsedMs: 8 } })
    render(<ScanPage recognizeHandwriting={recognizeHandwriting} />); await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Фото номера' }))
    const input = await screen.findByLabelText('Снять или выбрать фото')
    expect(h.stop).toHaveBeenCalledTimes(1)
    fireEvent.change(input, { target: { files: [new File(['pixels'], 'number.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Распознать фото' }))
    const candidate = await screen.findByRole('button', { name: 'Выбрать #001 · Кухня' })
    expect(h.navigate).not.toHaveBeenCalled(); expect(h.getBox).toHaveBeenCalledWith(pid, 2)
    fireEvent.click(candidate)
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и открыть' }))
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(`/projects/${pid}/boxes/1`))
    expect(h.getBox).toHaveBeenCalledTimes(3)
  })
  it('смена проекта отменяет OCR и отклоняет его запоздалый результат', async () => {
    const pending = deferred<never>(); let signal!: AbortSignal
    const recognizeHandwriting = vi.fn((_file: Blob, s: AbortSignal) => { signal = s; return pending.promise })
    const page = render(<ScanPage recognizeHandwriting={recognizeHandwriting} />); await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Фото номера' }))
    fireEvent.change(await screen.findByLabelText('Снять или выбрать фото'), { target: { files: [new File(['x'], 'n.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Распознать фото' }))
    await waitFor(() => expect(recognizeHandwriting).toHaveBeenCalledTimes(1))
    h.pid = other; page.rerender(<ScanPage recognizeHandwriting={recognizeHandwriting} />)
    expect(signal.aborted).toBe(true)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo')
    expect(h.getBox).not.toHaveBeenCalled()
    await ready()
  })
  it('OCR не предлагает несуществующий номер и сохраняет ошибку сети', async () => {
    h.getBox.mockRejectedValueOnce(new ApiError('missing', 404)).mockRejectedValueOnce(new ApiError('offline', 0))
    const recognizeHandwriting = vi.fn().mockResolvedValue({ text: '#001\n002', candidates: ['#001', '002'], diagnostics: { engine: 'test', elapsedMs: 8 } })
    render(<ScanPage recognizeHandwriting={recognizeHandwriting} />); await ready()
    fireEvent.click(screen.getByRole('button', { name: 'Фото номера' }))
    fireEvent.change(await screen.findByLabelText('Снять или выбрать фото'), { target: { files: [new File(['x'], 'n.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Распознать фото' }))
    await screen.findByText('offline')
    expect(screen.queryByRole('button', { name: /Выбрать #/ })).toBeNull()
    expect(h.navigate).not.toHaveBeenCalled()
  })
})
