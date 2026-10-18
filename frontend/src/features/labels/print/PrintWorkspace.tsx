import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Label } from '../../../api/types'
import LabelSheet from '../../../components/LabelSheet'
import PageHeading from '../../../components/PageHeading'
import { boxPath, plural } from '../../../ui/format'
import { paginateLabels, PRESETS, QR_SIZES, readSettings, TEMPLATES } from './layout'
import './print.css'

export default function PrintWorkspace({ labels, pid, preview = false, single = false, extraSettings }: {
  labels: Label[]; pid: string; preview?: boolean; single?: boolean; extraSettings?: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const settings = readSettings(params)
  const { template, preset, copies, qr, writing } = settings
  const scoped = params.get('project') === pid
  const selection = scoped ? params.get('numbers') : null
  const selectedNumbers = selection === null ? null : new Set(selection.split(',').map(Number))
  const selected = single ? labels : labels.filter(l => selectedNumbers === null || selectedNumbers.has(l.number))
  const selectedSet = new Set(selected.map(l => l.number))
  const pages = paginateLabels(selected, copies, Number(preset))
  const [previewPage, setPreviewPage] = useState(0)
  const visiblePage = Math.min(previewPage, Math.max(0, pages.length - 1))
  const frame = useRef<HTMLDivElement>(null)
  const hasPages = pages.length > 0

  // Scale only the screen view. The print stylesheet keeps every page at 210 × 297 mm.
  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const resize = () => {
      const width = element.getBoundingClientRect().width
      if (width > 0) element.style.setProperty('--sheet-scale', String(width / (210 * 96 / 25.4)))
    }
    resize()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resize)
      observer.observe(element)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [hasPages])

  function update(values: Record<string, string | null>) {
    const next = new URLSearchParams(params)
    if (!scoped) next.delete('numbers')
    next.set('project', pid)
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }
  function toggle(number: number) {
    const next = new Set(selectedSet)
    if (next.has(number)) next.delete(number)
    else next.add(number)
    update({ numbers: [...next].sort((a, b) => a - b).join(',') })
  }
  const query = new URLSearchParams(params)
  if (!scoped) query.delete('numbers')
  query.set('project', pid)
  return <div className="mm-print-workspace">
    <PageHeading title={single ? `Этикетка · коробка ${String(labels[0].number).padStart(3, '0')}` : 'QR-этикетки'}>{single ? 'Приклейте на две стороны коробки' : 'Выберите коробки и распечатайте этикетки или сохраните PDF.'}</PageHeading>
    <div className="mm-print-controls no-print">
      <h2>Параметры печати</h2>
      <div className="mm-print-settings">
        <label>Шаблон<select aria-label="Шаблон" value={template} onChange={e => update({ template: e.target.value })}>{Object.entries(TEMPLATES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        <label>Раскладка A4<select aria-label="Раскладка A4" value={preset} onChange={e => update({ layout: e.target.value, qr: null })}>{Object.entries(PRESETS).map(([key, p]) => <option key={key} value={key}>{p.title.split(' · ')[0]}</option>)}</select></label>
        <label>Экземпляров каждой<select aria-label="Экземпляров каждой" value={copies} onChange={e => update({ copies: e.target.value })}>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
        {template !== 'no-qr' ? <label>Размер QR<select aria-label="Размер QR" value={qr} onChange={e => update({ qr: e.target.value })}>{QR_SIZES.filter(size => size <= PRESETS[preset].maxQr).map(size => <option key={size} value={size}>{size} × {size} мм</option>)}</select></label> : <label className="mm-print-check"><input type="checkbox" checked={writing} onChange={e => update({ writing: e.target.checked ? '1' : '0' })} />Поле для заметок</label>}
      </div>
      {!single ? <details open={!preview} className="mm-print-selection">
        <summary>Коробки: выбрано {selected.length} из {labels.length}</summary>
        <div className="mm-selection-actions"><button type="button" className="link" onClick={() => update({ numbers: null })}>Выбрать все</button><button type="button" className="link" onClick={() => update({ numbers: '' })}>Снять выбор</button></div>
        <div className="mm-print-boxes">{labels.map(label => <label key={label.number} className="mm-print-check"><input type="checkbox" checked={selectedSet.has(label.number)} onChange={() => toggle(label.number)} /><span>#{String(label.number).padStart(3, '0')} · {label.room}</span></label>)}</div>
      </details> : null}
      <p role="status" className="mm-print-total">{selected.length} {plural(selected.length, ['коробка', 'коробки', 'коробок'])} · {selected.length * copies} {plural(selected.length * copies, ['этикетка', 'этикетки', 'этикеток'])} · {pages.length} {plural(pages.length, ['лист', 'листа', 'листов'])} A4</p>
      <div className="mm-print-actions">
        <button className="primary" disabled={!pages.length} onClick={() => window.print()}><Printer className="icon-sm" aria-hidden />Печать / PDF</button>
        {preview ? <Link className="button" to={`/labels?${query}`}>К выбору коробок</Link> : null}
        {single ? <Link className="button" to={boxPath(pid, labels[0].number)}>К коробке</Link> : null}
      </div>
      <details className="mm-print-help"><summary>Как печатать</summary>
        <p>A4, масштаб 100% («Фактический размер»), колонтитулы отключены. Линии показывают края для вырезания.</p>
        <p>{import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false' && selected.some(l => l.qr_payload?.startsWith('MM1:'))
          ? 'Компактный QR сканируется внутри MoverMate. Универсальные этикетки открываются и обычной камерой телефона.'
          : 'QR открывает карточку коробки обычной камерой телефона или сканером MoverMate.'}</p>
        {template !== 'qr-only' ? <p>Длинная комната сокращается на этикетке; полное название видно в списке коробок.</p> : null}
      </details>
      {extraSettings}
    </div>
    <section className="mm-print-preview" aria-label="Предпросмотр листов A4">
      <header className="mm-preview-heading no-print"><h2>Лист A4</h2>{pages.length ? <span aria-live="polite">{visiblePage + 1} из {pages.length}</span> : null}</header>
      {hasPages ? <>
        <div className="mm-sheet-frame" ref={frame}>
          {pages.map((page, index) => <section key={index} className={`mm-a4 mm-a4--${preset}${index === visiblePage ? ' is-preview-page' : ''}`} style={{ '--label-height': `${PRESETS[preset].height}mm`, '--label-rows': PRESETS[preset].rows } as CSSProperties} aria-label={`Лист ${index + 1} из ${pages.length}`}>
            {page.map((label, item) => <LabelSheet key={`${label.number}-${item}`} label={label} template={template} qrMm={qr} writing={writing} qrPayload={import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false' ? label.qr_payload ?? undefined : undefined} />)}
          </section>)}
        </div>
        <nav className="mm-preview-pages no-print" aria-label="Листы предпросмотра">
          <button type="button" aria-label="Предыдущий лист" disabled={visiblePage === 0} onClick={() => setPreviewPage(visiblePage - 1)}><ChevronLeft className="icon-sm" aria-hidden /></button>
          <span>Лист {visiblePage + 1} из {pages.length}</span>
          <button type="button" aria-label="Следующий лист" disabled={visiblePage === pages.length - 1} onClick={() => setPreviewPage(visiblePage + 1)}><ChevronRight className="icon-sm" aria-hidden /></button>
        </nav>
        <p className="mm-preview-caption no-print">Уменьшенный вид. На печать уйдут все {pages.length} {plural(pages.length, ['лист', 'листа', 'листов'])}.</p>
      </> : <div className="mm-preview-empty no-print"><Printer className="icon" aria-hidden /><p>Выберите коробки для печати</p></div>}
    </section>
  </div>
}
