import type { CSSProperties, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Label } from '../../../api/types'
import LabelSheet from '../../../components/LabelSheet'
import PageHeading from '../../../components/PageHeading'
import { boxPath } from '../../../ui/format'
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
    <PageHeading title={single ? `Этикетка · коробка ${String(labels[0].number).padStart(3, '0')}` : preview ? 'Предпросмотр печати' : 'QR-этикетки'}>{single ? 'Приклейте на две стороны коробки' : 'Выберите коробки и формат листа для печати.'}</PageHeading>
    <div className="mm-print-controls no-print">
      <h2>{single ? 'Параметры этикетки' : 'Подготовка к печати'}</h2>
      <p>{import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false' && selected.some(l => l.qr_payload?.startsWith('MM1:'))
        ? 'Компактный QR сканируется внутри MoverMate. Универсальные этикетки открываются и обычной камерой телефона.'
        : 'Универсальный QR открывает карточку обычной камерой телефона или сканером MoverMate.'}</p>
      {extraSettings}
      <div className="mm-print-settings">
        <label>Шаблон<select value={template} onChange={e => update({ template: e.target.value })}>{Object.entries(TEMPLATES).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        <label>Раскладка A4<select value={preset} onChange={e => update({ layout: e.target.value, qr: null })}>{Object.entries(PRESETS).map(([key, p]) => <option key={key} value={key}>{p.title}</option>)}</select></label>
        <label>Экземпляров каждой<select value={copies} onChange={e => update({ copies: e.target.value })}>{Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
        {template !== 'no-qr' ? <label>Размер QR с белым полем<select value={qr} onChange={e => update({ qr: e.target.value })}>{QR_SIZES.filter(size => size <= PRESETS[preset].maxQr).map(size => <option key={size} value={size}>{size} × {size} мм</option>)}</select></label> : <label className="mm-print-check"><input type="checkbox" checked={writing} onChange={e => update({ writing: e.target.checked ? '1' : '0' })} />Поле для заметок</label>}
      </div>
      <p className="small muted">Размер QR меняет размер на бумаге. Плотность кода зависит от содержимого; белое поле — 4 модуля.</p>
      {!single ? <details open={!preview} className="mm-print-selection">
        <summary>Коробки: выбрано {selected.length} из {labels.length}</summary>
        <div className="row"><button type="button" onClick={() => update({ numbers: null })}>Выбрать все</button><button type="button" onClick={() => update({ numbers: '' })}>Снять выбор</button></div>
        <div className="mm-print-boxes">{labels.map(label => <label key={label.number} className="mm-print-check"><input type="checkbox" checked={selectedSet.has(label.number)} onChange={() => toggle(label.number)} /><span>#{String(label.number).padStart(3, '0')} · {label.room}</span></label>)}</div>
      </details> : null}
      <div className="row">
        <button className="primary" disabled={!pages.length} onClick={() => window.print()}>Печать / PDF</button>
        {preview ? <Link className="button" to={`/labels?${query}`}>К выбору коробок</Link> : null}
        {single ? <Link className="button" to={boxPath(pid, labels[0].number)}>К коробке</Link> : null}
      </div>
      <p role="status">{selected.length} коробок · {selected.length * copies} этикеток · {pages.length} листов A4</p>
      <p className="small">В диалоге печати: A4, масштаб 100% («Фактический размер»), колонтитулы отключены. Можно сохранить PDF. Линии обозначают края для вырезания.</p>
      {template !== 'qr-only' ? <p className="small muted">Длинная комната сокращается на этикетке; полное название видно в выборе коробок и карточке.</p> : null}
    </div>
    {!pages.length ? <p className="no-print">Выберите хотя бы одну коробку для печати.</p> : null}
    <div className="mm-print-preview" aria-label="Листы A4">
      {pages.map((page, index) => <section key={index} className={`mm-a4 mm-a4--${preset}`} style={{ '--label-height': `${PRESETS[preset].height}mm`, '--label-rows': PRESETS[preset].rows } as CSSProperties} aria-label={`Лист ${index + 1} из ${pages.length}`}>
        {page.map((label, item) => <LabelSheet key={`${label.number}-${item}`} label={label} template={template} qrMm={qr} writing={writing} qrPayload={import.meta.env.VITE_COMPACT_QR_ENABLED !== 'false' ? label.qr_payload ?? undefined : undefined} />)}
      </section>)}
    </div>
  </div>
}
