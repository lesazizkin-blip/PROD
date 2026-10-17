import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PersonalPlanner from './PersonalPlanner'
import SpeechInput from './SpeechInput'
import type { PersonalPlan } from './types'

const draft: PersonalPlan = {
  tasks: [{ title: 'Купить переноску', stage: 'before', offset_days: -3 }],
  first_day: ['Корм для кошки'],
}
const fetchMock = vi.fn()

function Harness() {
  const [plan, setPlan] = useState<PersonalPlan | null>(null)
  const [busy, setBusy] = useState(false)
  return <><PersonalPlanner moveDate="2026-11-01" plan={plan} onPlan={setPlan} busy={busy} onBusy={setBusy} />
    <output data-testid="plan">{JSON.stringify(plan)}</output></>
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(new Response(JSON.stringify(draft), { status: 200 }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

async function describeMove() {
  await userEvent.type(screen.getByLabelText('Особенности и пожелания'), 'Переезжаем с кошкой в другой город')
}
async function generate() {
  await describeMove()
  await userEvent.click(screen.getByRole('checkbox'))
  await userEvent.click(screen.getByRole('button', { name: 'Предложить персональный план' }))
}

it('does not transmit description until explicit consent and click', async () => {
  render(<Harness />)
  await describeMove()
  expect((screen.getByRole('button', { name: 'Предложить персональный план' }) as HTMLButtonElement).disabled).toBe(true)
  expect(fetchMock).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('checkbox'))
  expect(fetchMock).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Предложить персональный план' }))
  await screen.findByLabelText('Предпросмотр плана')
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    description: 'Переезжаем с кошкой в другой город', move_date: '2026-11-01', consent: true,
  })
  expect(fetchMock.mock.calls[0][0]).toBe('/api/projects/plan-preview')
})

it('allows reviewing, editing and discarding the draft', async () => {
  render(<Harness />)
  await generate()
  const title = await screen.findByLabelText('Задача 1')
  await userEvent.clear(title)
  await userEvent.type(title, 'Проверить переноску')
  expect(JSON.parse(screen.getByTestId('plan').textContent!).tasks[0].title).toBe('Проверить переноску')
  await userEvent.selectOptions(screen.getByLabelText('Этап'), 'moving_day')
  expect(JSON.parse(screen.getByTestId('plan').textContent!).tasks[0].offset_days).toBe(0)
  await userEvent.click(screen.getByRole('button', { name: 'Удалить предмет 1' }))
  expect(JSON.parse(screen.getByTestId('plan').textContent!).first_day).toEqual([])
  await userEvent.click(screen.getByRole('button', { name: 'Использовать только стандартный план' }))
  expect(screen.getByTestId('plan').textContent).toBe('null')
})

it('invalidates preview when requirements change', async () => {
  render(<Harness />)
  await generate()
  await screen.findByLabelText('Задача 1')
  await userEvent.type(screen.getByLabelText('Особенности и пожелания'), ', и с ребёнком')
  expect(screen.queryByLabelText('Предпросмотр плана')).toBeNull()
})

it('unlocks the form after provider failure and keeps entered text', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Модель недоступна' }), { status: 503 }))
  render(<Harness />)
  await generate()
  expect((await screen.findByRole('alert')).textContent).toBe('Модель недоступна')
  expect((screen.getByLabelText('Особенности и пожелания') as HTMLTextAreaElement).value).toContain('кошкой')
  expect((screen.getByRole('button', { name: 'Предложить персональный план' }) as HTMLButtonElement).disabled).toBe(false)
})

it('locks repeated generation and requirement editing while waiting', async () => {
  let resolve!: (response: Response) => void
  fetchMock.mockReturnValue(new Promise<Response>((r) => { resolve = r }))
  render(<Harness />)
  await generate()
  expect((screen.getByRole('button', { name: 'Составляем план…' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByLabelText('Особенности и пожелания') as HTMLTextAreaElement).disabled).toBe(true)
  resolve(new Response(JSON.stringify(draft)))
  await screen.findByLabelText('Предпросмотр плана')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('offers text input when speech recognition is unsupported', () => {
  render(<Harness />)
  expect((screen.getByRole('button', { name: 'Продиктовать пожелания' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/В этом браузере диктовка недоступна/)).toBeTruthy()
})

it('dictates Russian text, handles permission error and aborts on unmount', async () => {
  const onText = vi.fn()
  const onListening = vi.fn()
  const recognition = {
    lang: '', continuous: false, interimResults: false,
    onresult: null as null | ((event: unknown) => void),
    onerror: null as null | ((event: unknown) => void),
    onend: null as null | (() => void),
    start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
  }
  vi.stubGlobal('webkitSpeechRecognition', class { constructor() { return recognition } })
  const { unmount } = render(<SpeechInput disabled={false} onText={onText} onListening={onListening} />)
  await userEvent.click(screen.getByRole('button', { name: 'Продиктовать пожелания' }))
  expect(recognition.lang).toBe('ru-RU')
  expect(onListening).toHaveBeenCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Остановить запись' }))
  expect(recognition.stop).toHaveBeenCalled()
  recognition.onresult!({ results: [{ isFinal: true, 0: { transcript: 'Переезжаем с кошкой' } }] })
  expect(onText).toHaveBeenCalledWith('Переезжаем с кошкой')
  recognition.onerror!({ error: 'not-allowed' })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Нет доступа к микрофону'))
  unmount()
  expect(recognition.abort).toHaveBeenCalled()
})
