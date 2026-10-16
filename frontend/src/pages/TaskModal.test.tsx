import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../api/types'
import { TaskModal } from './PlanPage'

afterEach(cleanup)

// в jsdom у <dialog> нет showModal/close
HTMLDialogElement.prototype.showModal = function () { this.open = true }
HTMLDialogElement.prototype.close = function () { this.open = false }

const task: Task = {
  id: 7, project_id: 'p', stage: 'moving_day', title: 'Погрузка', due_date: '2026-10-30',
  start_time: '09:00:00', end_time: '12:30:00', category: 'Грузчики', category_color: '#f0a04b',
  assignee: 'Аня', done: false, done_at: null, template_id: null,
}

describe('форма задачи', () => {
  it('правка: поля заполнены текущими значениями и сохраняются целиком', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskModal initial={task} onClose={vi.fn()} onSave={onSave} categories={new Map()} />)
    expect(screen.getByRole('heading', { name: 'Изменить задачу' })).toBeTruthy()
    const title = screen.getByLabelText('Что сделать')
    await userEvent.clear(title)
    await userEvent.type(title, 'Погрузка мебели')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onSave).toHaveBeenCalledWith({
      stage: 'moving_day', title: 'Погрузка мебели', assignee: 'Аня', due_date: '2026-10-30',
      start_time: '09:00', end_time: '12:30', category: 'Грузчики', category_color: '#f0a04b',
    })
  })

  it('уже известная категория подставляет свой цвет', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskModal initial={null} onClose={vi.fn()} onSave={onSave} categories={new Map([['Документы', '#123456']])} />)
    await userEvent.type(screen.getByLabelText('Что сделать'), 'Паспорт')
    await userEvent.type(screen.getByLabelText('Категория (необязательно)'), 'Документы')
    await userEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ category: 'Документы', category_color: '#123456' })
  })
})

describe('удаление задачи', () => {
  it('кнопка есть только в правке и спрашивает подтверждение', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<TaskModal initial={task} onClose={vi.fn()} onSave={vi.fn()} onDelete={onDelete} categories={new Map()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Удалить задачу' }))
    expect(window.confirm).toHaveBeenCalled()
    expect(onDelete).toHaveBeenCalledTimes(1)
    cleanup()
    render(<TaskModal initial={null} onClose={vi.fn()} onSave={vi.fn()} categories={new Map()} />)
    expect(screen.queryByRole('button', { name: 'Удалить задачу' })).toBeNull()
  })
})
