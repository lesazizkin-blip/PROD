import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Label } from '../../../api/types'
import PrintWorkspace from './PrintWorkspace'
import { paginateLabels, PRESETS, readSettings } from './layout'

const labels: Label[] = Array.from({ length: 13 }, (_, i) => ({
  number: i + 1, room: i === 0 ? 'Очень длинная комната назначения с вещами для первого вечера' : 'Кухня',
  project_name: 'Переезд', qr_path: `/projects/p/boxes/${i + 1}`, items_preview: [],
}))
afterEach(cleanup)
describe('A4 printing', () => {
  for (const capacity of [4, 8, 12]) for (const count of [0, 1, 4, 9, 12, 13]) {
    it(`${count} boxes, ${capacity} labels per sheet: exact pages and no empty tail`, () => {
      const pages = paginateLabels(labels.slice(0, count), 2, capacity)
      expect(pages.length).toBe(Math.ceil(count * 2 / capacity))
      expect(pages.flat().map(l => l.number)).toEqual(labels.slice(0, count).flatMap(l => [l.number, l.number]))
      expect(pages.every(p => p.length > 0 && p.length <= capacity)).toBe(true)
    })
  }
  it('presets stay within A4 with 10mm margins and 6mm row gaps', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.rows * preset.height + (preset.rows - 1) * 6).toBeCloseTo(277)
      expect(preset.maxQr + 6).toBeLessThanOrEqual(preset.height)
    }
  })
  it('rejects corrupt URL settings and QR sizes too large for the preset', () => {
    expect(readSettings(new URLSearchParams('template=__proto__&layout=bad&copies=Infinity&qr=500'))).toEqual({ template: 'standard', preset: '8', copies: 1, qr: 34, writing: false })
    expect(readSettings(new URLSearchParams('layout=12&qr=56')).qr).toBe(28)
  })
  it('keeps selection, copies and template with inline printable sheets', () => {
    render(<MemoryRouter initialEntries={['/labels']}><Routes>
      <Route path="/labels" element={<PrintWorkspace labels={labels} pid="p" />} />
      <Route path="/labels/print" element={<PrintWorkspace labels={labels} pid="p" preview />} />
    </Routes></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Снять выбор' }))
    expect((screen.getByRole('button', { name: 'Печать / PDF' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('#001 · Очень длинная комната назначения с вещами для первого вечера'))
    fireEvent.change(screen.getByLabelText('Экземпляров каждой'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Шаблон'), { target: { value: 'notes' } })
    expect(screen.queryByRole('link', { name: 'Предпросмотр →' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('1 коробка · 2 этикетки · 1 лист')
    expect(screen.getAllByLabelText('Поле для заметок от руки')).toHaveLength(2)
    expect((screen.getByLabelText('Экземпляров каждой') as HTMLSelectElement).value).toBe('2')
    expect((screen.getByLabelText('#002 · Кухня') as HTMLInputElement).checked).toBe(false)
  })
  it('single-label route prints only that box even with stale selection in URL', () => {
    render(<MemoryRouter initialEntries={['/?project=p&numbers=2&copies=2']}><PrintWorkspace labels={[labels[0]]} pid="p" single /></MemoryRouter>)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getAllByLabelText('Этикетка коробки 1')).toHaveLength(2)
  })
  it('selection belongs to its project, not to a matching box number elsewhere', () => {
    render(<MemoryRouter initialEntries={['/?project=other&numbers=1']}><PrintWorkspace labels={labels} pid="p" /></MemoryRouter>)
    expect(screen.getAllByRole('article')).toHaveLength(13)
  })
  it('uses all four templates and removes the QR in the no-QR template', () => {
    const { container } = render(<MemoryRouter><PrintWorkspace labels={[labels[0]]} pid="p" /></MemoryRouter>)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBeTruthy()
    for (const template of ['qr-only', 'notes', 'no-qr']) {
      fireEvent.change(screen.getByLabelText('Шаблон'), { target: { value: template } })
      expect(container.querySelector(`.mm-label--${template}`)).toBeTruthy()
    }
    expect(container.querySelector('svg')).toBeNull()
    fireEvent.click(screen.getByLabelText('Поле для заметок'))
    expect(screen.getByLabelText('Поле для заметок от руки')).toBeTruthy()
  })
  it('clears selection on a project change link', () => {
    render(<MemoryRouter initialEntries={['/?project=p&numbers=1']}><PrintWorkspace labels={labels} pid="q" /><Link to="/?project=q&numbers=">clear</Link></MemoryRouter>)
    expect(screen.getAllByRole('article')).toHaveLength(13)
    fireEvent.click(screen.getByRole('link', { name: 'clear' }))
    expect(screen.queryAllByRole('article')).toHaveLength(0)
  })
})
