import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import ChecklistModal from './ChecklistModal'

const apply = vi.fn().mockResolvedValue({ added_tasks: 0, added_first_day: 1 })
vi.mock('../api/endpoints', () => ({ api: { taskTemplates: async () => [], suggestChecklist: async () => ({ suggested_tasks: [], suggested_first_day: ['Зарядка для детского планшета'] }), applyChecklist: (...args: unknown[]) => apply(...args) } }))
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }
afterEach(cleanup)

it('показывает и сохраняет рекомендации первого дня, даже если новых задач нет', async () => {
  const applied = vi.fn()
  render(<ChecklistModal pid="p1" onClose={vi.fn()} onApplied={applied} />)
  await userEvent.click(screen.getByRole('checkbox', { name: 'Переезжаем с детьми' }))
  await userEvent.click(screen.getByRole('button', { name: 'Показать, что добавим' }))
  await screen.findByText('Зарядка для детского планшета')
  await userEvent.click(screen.getByRole('button', { name: 'Добавить всё (1)' }))
  await waitFor(() => expect(applied).toHaveBeenCalledTimes(1))
  expect(screen.getByText(/пунктов первого дня: 1/)).toBeTruthy()
})
