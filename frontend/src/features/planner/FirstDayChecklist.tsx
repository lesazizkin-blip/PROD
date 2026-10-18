import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api/endpoints'
import { readAllPages } from '../../api/pagination'
import type { FirstDayItem } from '../../api/types'
import Modal from '../../components/Modal'
import { useAsync } from '../../state/useAsync'
import { useAction } from '../../state/useAction'
import { useConfirm } from '../../state/confirm'
import ErrorAlert from '../../ui/ErrorAlert'
import { boxPath } from '../../ui/format'
import { FIRST_DAY_BASICS, firstDayLines, normalizeTitle } from './firstDayDefaults'
import './first-day.css'

/** The preparation list and actual packed inventory are both visible here. */
export default function FirstDayChecklist({ pid }: { pid: string }) {
  const planned = useAsync(() => api.firstDay(pid), [pid], { refreshOnFocus: true })
  const inventory = useAsync(() => api.firstDayItems(pid), [pid], { refreshOnFocus: true })
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<FirstDayItem | null>(null)
  const [binding, setBinding] = useState<FirstDayItem | null>(null)
  const reload = () => { planned.reload(); inventory.reload() }
  const { busy, error, run } = useAction(reload)
  const confirm = useConfirm()
  const list = planned.data ?? []
  const packed = inventory.data ?? []
  const ready = list.filter(x => x.done).length
  function togglePlanned(item: FirstDayItem) {
    planned.mutate(items => items?.map(x => x.id === item.id ? { ...x, done: !item.done } : x) ?? items)
    void run(async () => { try { await api.updateFirstDay(pid, item.id, { done: !item.done }) } catch (e) { planned.reload(); throw e } })
  }
  async function addLines(text: string) {
    const titles = firstDayLines(text)
    if (titles.some(t => t.length > 200)) throw new Error('Название пункта не должно быть длиннее 200 символов.')
    // Reread before retrying: a partial request must not duplicate saved entries.
    const existing = new Set((await api.firstDay(pid)).map(x => normalizeTitle(x.title)))
    try {
      for (const title of titles) if (!existing.has(normalizeTitle(title))) {
        await api.createFirstDay(pid, title)
        existing.add(normalizeTitle(title))
      }
      setAdding(null)
    } finally { reload() }
  }
  return <section className="first-day-checklist stack" aria-label="Список первого дня">
    <div className="row between wrap"><h2>Первый день</h2><button className="tonal" onClick={() => setAdding('')}><Plus className="icon-sm" aria-hidden />Пункт</button></div>
    <p className="muted small">Подготовьте необходимое заранее. Когда появятся коробки, укажите, куда положили вещи.</p>
    <ErrorAlert message={error ?? planned.error ?? inventory.error} />
    {planned.error || inventory.error ? <button onClick={reload}>Повторить загрузку списка</button> : null}
    {planned.loading && !planned.data ? <p role="status">Загружаем список…</p> : null}
    {planned.data ? <>
      <h3>Что подготовить <span className="muted small">{ready} из {list.length}</span></h3>
      {list.length ? <ul className="plain preparation-list">{list.map(item => <li key={item.id} className="preparation-row">
        <label className={`preparation-title${item.done ? ' done' : ''}`}><input className="check" type="checkbox" checked={item.done} disabled={busy} onChange={() => togglePlanned(item)} /><span>{item.title}</span></label>
        <div className="preparation-tools">
          <button disabled={busy} onClick={() => setBinding(item)} aria-label={`Указать коробку: ${item.title}`}>В коробку</button>
          <button disabled={busy} className="link icon-btn" aria-label={`Изменить пункт «${item.title}»`} onClick={() => setEditing(item)}><Pencil className="icon-sm" aria-hidden /></button>
          <button disabled={busy} className="link icon-btn" aria-label={`Удалить пункт «${item.title}»`} onClick={async () => { if (await confirm({ title: `Удалить «${item.title}»?`, message: 'Пункт исчезнет из списка первого дня.' })) void run(() => api.deleteFirstDay(pid, item.id)) }}><Trash2 className="icon-sm" aria-hidden /></button>
        </div>
      </li>)}</ul> : <div className="stack"><p className="muted small">Добавьте щётки, зарядки, чайник и бельё — или составьте свой список.</p><button onClick={() => setAdding(FIRST_DAY_BASICS.join('\n'))}>Подготовить базовый список</button></div>}
    </> : null}
    <h3>В коробках <span className="muted small">{packed.length ? `распаковано ${packed.filter((x) => x.status === 'unpacked').length} из ${packed.length}` : 'пока пусто'}</span></h3>
    {inventory.loading && !inventory.data ? <p role="status">Загружаем вещи…</p> : null}
    {packed.length ? <>
      <ul className="plain preparation-list">{packed.map(x => <li key={x.item.id} className="preparation-row">
        <span className={`preparation-title${x.status === 'unpacked' ? ' done' : ''}`}><span>{x.status === 'unpacked' ? '✓ ' : ''}{x.item.name}{(x.item.quantity ?? 1) > 1 ? ` · ${x.item.quantity} шт.` : ''}{x.status === 'unpacked' ? ' · распакована' : ''}{x.item.lost ? ' · Не могу найти' : ''}{x.item.damaged ? ' · Повреждена' : ''}</span></span>
        <Link to={boxPath(pid, x.box_number)} className="button small">№ {x.box_number} · {x.room}</Link>
      </li>)}</ul>
    </> : inventory.data ? <p className="muted small">Вещей в коробках пока нет. Нажмите «В коробку» у пункта выше или отметьте «Первый день» в карточке коробки.</p> : null}
    {adding !== null ? <ListEditor initial={adding} onClose={() => setAdding(null)} onSave={addLines} /> : null}
    {editing ? <ListEditor initial={editing.title} single onClose={() => setEditing(null)} onSave={async text => { await api.updateFirstDay(pid, editing.id, { title: text.trim() }); setEditing(null); reload() }} /> : null}
    {binding ? <BindFirstDayItem pid={pid} item={binding} onClose={() => setBinding(null)} onSaved={() => { setBinding(null); reload() }} onChanged={reload} /> : null}
  </section>
}

function ListEditor({ initial, single = false, onSave, onClose }: { initial: string; single?: boolean; onSave: (text: string) => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState(initial)
  const { busy, error, submit } = useAction()
  return <Modal title={single ? 'Изменить пункт' : 'Добавить в список первого дня'} onClose={onClose} dirty={text !== initial}>
    <form className="stack" onSubmit={submit(() => onSave(text))}>
      <label>{single ? 'Название пункта' : 'По одному пункту на строку'}{single ? <input value={text} onChange={e => setText(e.target.value)} maxLength={200} data-autofocus /> : <textarea value={text} onChange={e => setText(e.target.value)} rows={5} maxLength={5000} data-autofocus />}</label>
      <ErrorAlert message={error} /><button className="primary" disabled={busy || !text.trim()}>{single ? 'Сохранить' : 'Добавить пункты'}</button>
    </form>
  </Modal>
}

function BindFirstDayItem({ pid, item, onClose, onSaved, onChanged }: { pid: string; item: FirstDayItem; onClose: () => void; onSaved: () => void; onChanged: () => void }) {
  const boxes = useAsync(() => readAllPages(page => api.boxes(pid, { page, page_size: 200 })), [pid])
  const [number, setNumber] = useState('')
  const [name, setName] = useState(item.title)
  const { busy, error, submit } = useAction()
  return <Modal title="В какую коробку положили вещь?" onClose={onClose}>
    <form className="stack" onSubmit={submit(async () => {
      try {
        await api.bindFirstDay(pid, item.id, Number(number), name.trim())
        onSaved()
      } finally { onChanged() }
    })}>
      <label>Название вещи в коробке<input value={name} maxLength={120} onChange={e => setName(e.target.value)} data-autofocus /></label>
      {name.length > 120 ? <p role="alert">Сократите название до 120 символов.</p> : null}
      <label>Коробка<select value={number} onChange={e => setNumber(e.target.value)} disabled={busy || boxes.loading}><option value="">Выберите коробку</option>{boxes.data?.map(b => <option key={b.number} value={b.number}>№ {b.number} · {b.room}</option>)}</select></label>
      {boxes.data?.length === 0 ? <Link to="/boxes" className="button">Создать коробку</Link> : null}
      <p className="muted small">Пункт переместится в раздел «В коробках». Вещь будет помечена как нужная в первый день.</p>
      <ErrorAlert message={error ?? boxes.error} />{boxes.error ? <button type="button" onClick={boxes.reload}>Повторить загрузку коробок</button> : null}
      <button className="primary" disabled={busy || !number || !name.trim() || name.trim().length > 120}>Сохранить коробку</button>
    </form>
  </Modal>
}
