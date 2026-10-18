import RequireProject from '../components/RequireProject'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRightLeft, Pencil, Plus, QrCode, Trash2 } from 'lucide-react'
import { type BoxStatus, type Item, type PhotoItem } from '../api/types'
import { errorMessage } from '../api/client'
import { api } from '../api/endpoints'
import { readAllPages } from '../api/pagination'
import Modal from '../components/Modal'
import PhotoPicker from '../components/PhotoPicker'
import StatusPickerModal from '../components/StatusPickerModal'
import { boxStatusOptions } from '../components/statusOptions'
import { useConfirm } from '../state/confirm'
import CartonLid from '../components/CartonLid'
import { useBoxNavigation } from '../features/boxes/BoxNavigation'
import '../features/boxes/box-workspace.css'
import { useProjects } from '../state/ProjectContext'
import { useAction } from '../state/useAction'
import { useAsync } from '../state/useAsync'
import ErrorAlert from '../ui/ErrorAlert'
import StateView from '../ui/StateView'
import StatusBadge from '../ui/StatusBadge'
import { roomStyle } from '../ui/roomTheme'
import { boxPath, labelPath, plural } from '../ui/format'

// Карточка коробки. Сюда ведёт QR: /projects/{pid}/boxes/{n} (открытие только читает, дублей не создаёт).
export default function BoxPage() {
  const { pid = '', n = '' } = useParams()
  return <RequireProject pid={pid}>{() => <BoxWorkspace key={`${pid}/${n}`} pid={pid} number={Number(n)} />}</RequireProject>
}

function BoxWorkspace({ pid, number }: { pid: string; number: number }) {
  const navigate = useNavigate()
  const navigation = useBoxNavigation()
  const { projects, currentId, select } = useProjects()
  const valid = pid !== '' && Number.isInteger(number) && number >= 1
  const card = useAsync(() => (valid ? api.getBox(pid, number) : Promise.reject(new Error('Некорректная ссылка на коробку'))), [pid, number], { refreshOnFocus: true, initialData: navigation.cardSeed(pid, number) })
  const { busy: actionBusy, error, run } = useAction(() => card.reload())
  const [packingAnimation, setPackingAnimation] = useState(false)
  const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeKey = useRef(`${pid}/${number}`)
  const busy = actionBusy || packingAnimation
  useEffect(() => {
    routeKey.current = `${pid}/${number}`
    setPackingAnimation(false)
    return () => {
      routeKey.current = ''
      if (animationTimer.current) clearTimeout(animationTimer.current)
    }
  }, [pid, number])

  // Вперёд - на следующий этап, назад - на любой; при «Собрана» коробка заклеивается (только после подтверждённого сохранения)
  async function changeStatus(to: BoxStatus) {
    const key = `${pid}/${number}`
    await api.transition(pid, number, to)
    card.reload()
    if (to === 'packed' && routeKey.current === key && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPackingAnimation(true)
      animationTimer.current = setTimeout(() => setPackingAnimation(false), 1600)
    }
  }
  const confirm = useConfirm()
  const [itemError, setItemError] = useState<string | null>(null)
  const itemRequests = useRef(new Set<number>())
  const [pendingItems, setPendingItems] = useState<number[]>([])

  // Отметки у вещей срабатывают сразу на экране, запрос идёт следом; при ошибке карточка перечитывается.
  // Для одной вещи ждём завершения запроса, чтобы быстрые повторные нажатия не меняли порядок отметок.
  const optimistic = (apply: (items: Item[]) => Item[], request: () => Promise<unknown>, id: number) => {
    if (itemRequests.current.has(id)) return
    itemRequests.current.add(id)
    setPendingItems([...itemRequests.current])
    setItemError(null)
    card.mutate((b) => (b ? { ...b, items: apply(b.items) } : b))
    request().catch((e) => {
      setItemError(errorMessage(e))
      card.reload()
    }).finally(() => { itemRequests.current.delete(id); setPendingItems([...itemRequests.current]) })
  }
  const patchItem = (id: number, patch: Partial<Pick<Item, 'first_day' | 'lost' | 'damaged'>>) =>
    optimistic((items) => items.map((x) => (x.id === id ? { ...x, ...patch, lost: patch.lost ?? x.lost } : x)), () => api.updateItem(pid, id, patch), id)
  const removeItem = (id: number) =>
    optimistic((items) => items.filter((x) => x.id !== id), () => api.deleteItem(pid, id), id)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pickingBox, setPickingBox] = useState(false)
  const [movingItem, setMovingItem] = useState<Item | null>(null)
  const [movedTo, setMovedTo] = useState<{ name: string; number: number } | null>(null)

  // Открыли коробку по QR из другого проекта: переключаем вкладки на него, чтобы «Коробки» и «План» были про ту же коробку
  useEffect(() => {
    if (valid && pid !== currentId && projects.some((p) => p.id === pid)) select(pid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, projects])

  async function deleteBox() {
    if (!(await confirm({ title: `Удалить коробку № ${number}?`, message: 'Вместе с ней удалятся все вещи внутри. Это нельзя отменить.' }))) return
    void run(async () => {
      await api.deleteBox(pid, number)
      navigate('/boxes')
    })
  }

  const box = card.data
  const boxOptions = box ? boxStatusOptions(box.status) : []

  return (
    <>
    <Link to="/boxes" className="button back-link carton-back" aria-busy={navigation.pendingPath === '/boxes' || undefined} onClick={(event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      if (navigation.pendingPath !== '/boxes') void navigation.returnToShelf(pid, number)
    }}><ArrowLeft className="icon-sm" aria-hidden />К коробкам</Link>
    <StateView loading={card.loading && !box} error={card.error} onRetry={card.reload}>
      {box ? (
        <>
          <div className="carton-scene">
          <article className={`carton-workspace ${box.status === 'packing' || box.status === 'unpacked' ? 'is-open' : 'is-sealed'}${packingAnimation ? ' is-closing' : ''}`} style={{ ...roomStyle(box.room), viewTransitionName: 'carton-zoom' }} aria-labelledby="box-heading">
            <CartonLid status={box.status} closing={packingAnimation} className="carton-workspace__lid" />
            <header className="carton-identity">
              <div className="carton-identity__number" aria-hidden>{String(box.number).padStart(3, '0')}</div>
              <div className="carton-identity__title">
                <h1 id="box-heading" tabIndex={-1}>Коробка {String(box.number).padStart(3, '0')}</h1>
                <p className="carton-identity__room">{box.room}</p>
                <p className="muted small">{box.items.length} {plural(box.items.length, ['вещь', 'вещи', 'вещей'])}</p>
              </div>
              <div className="carton-identity__status">
                <StatusBadge status={box.status} />
                {box.fill_later && box.items.length === 0 ? <span className="badge st-packed">Заполнить позже</span> : null}
                <button className="primary" disabled={busy} onClick={() => setPickingBox(true)}>{packingAnimation ? 'Заклеиваем…' : 'Сменить статус'}</button>
              </div>
              <div className="carton-identity__actions">
                <button className="tonal" onClick={() => setAdding(true)}><Plus className="icon-sm" aria-hidden />Вещи</button>
                <Link to={labelPath(pid, number)} className="button tonal"><QrCode className="icon-sm" aria-hidden />Этикетка</Link>
                <button onClick={() => setEditing(true)}><Pencil className="icon-sm" aria-hidden />Изменить</button>
              </div>
            </header>
          <ErrorAlert message={error} />
          <section className="box-manifest" aria-labelledby="manifest-heading">
          <ErrorAlert message={itemError} />
          {movedTo ? <p role="status">«{movedTo.name}» переложена в <Link to={boxPath(pid, movedTo.number)}>коробку № {movedTo.number}</Link>.</p> : null}
          <h2 id="manifest-heading">Содержимое <span>({box.items.length})</span></h2>
          {box.items.length === 0 ? <p className="muted">Пока пусто. Добавьте вещи кнопкой «+ Вещи».</p> : null}
          {box.items.length > 0 ? (
            <div className="manifest-items">
              {box.items.map((item) => (
                <div key={item.id} className="manifest-item">
                  <span className="manifest-item__description">
                    <b>{item.name}</b>
                    {item.lost ? <span className="sub">Не могу найти. Подсказки — на «Прогрессе».</span> : null}
                  </span>
                  <div className="manifest-item__tools">
                  <button
                    className={item.first_day ? 'chip-toggle on' : 'chip-toggle'}
                    disabled={pendingItems.includes(item.id)}
                    aria-pressed={item.first_day}
                    title="Понадобится в первый день на новом месте"
                    onClick={() => patchItem(item.id, { first_day: !item.first_day })}
                  >
                    {item.first_day ? '✓ ' : ''}Первый день
                  </button>
                  <button className={item.lost ? 'chip-toggle warn on' : 'chip-toggle warn'} disabled={pendingItems.includes(item.id)} aria-pressed={item.lost} onClick={() => patchItem(item.id, { lost: !item.lost })} aria-label={`${item.lost ? 'Нашлась' : 'Не могу найти'}: ${item.name}`}>{item.lost ? 'Нашлась' : 'Не могу найти'}</button>
                  <button className={item.damaged ? 'chip-toggle warn on' : 'chip-toggle warn'} disabled={pendingItems.includes(item.id)} aria-pressed={!!item.damaged} onClick={() => patchItem(item.id, { damaged: !item.damaged })} aria-label={`Повреждена: ${item.name}`}>Повреждена</button>
                  <button className="link small item-move" disabled={pendingItems.includes(item.id)} onClick={() => setMovingItem(item)} aria-label={`Переложить «${item.name}»`}><ArrowRightLeft className="icon-sm" aria-hidden />Переложить</button>
                  <button className="link small" disabled={busy} aria-label={`Удалить «${item.name}»`} onClick={async () => { if (await confirm({ title: `Удалить «${item.name}»?`, message: 'Вещь пропадёт из коробки и из поиска.' })) removeItem(item.id) }}><Trash2 className="icon-sm" aria-hidden /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <button className="manifest-add" onClick={() => setAdding(true)}><Plus className="icon-sm" aria-hidden />Добавить вещи</button>
          </section>
          <footer className="carton-footer">
            <details className="carton-help">
              <summary>Нет принтера?</summary>
              <p>Напишите маркером на коробке <strong>#{String(box.number).padStart(3, '0')}</strong> и комнату «{box.room}». Подпишите с двух сторон — так её проще найти в стопке.</p>
              <p>Открыть коробку можно по номеру в выбранном проекте.</p>
              <Link to="/scan" className="button tonal">Найти по номеру</Link>
            </details>
            <button className="danger" disabled={busy} onClick={deleteBox}><Trash2 className="icon-sm" aria-hidden />Удалить коробку</button>
          </footer>
          <span className="carton-workspace__staples" aria-hidden />
          <div className="carton-workspace__marks" aria-hidden><span>↑↑</span><i /></div>
          </article>
          </div>

          {pickingBox ? (
            <StatusPickerModal
              title={`Статус коробки № ${box.number}`}
              current={box.status}
              options={boxOptions}
              onPick={changeStatus}
              onClose={() => setPickingBox(false)}
            />
          ) : null}
          {movingItem ? <MoveItemModal pid={pid} from={number} item={movingItem} onClose={() => setMovingItem(null)} onMoved={target => { setMovedTo({ name: movingItem.name, number: target }); setMovingItem(null); card.reload() }} /> : null}
          {adding ? (
            <AddItemsModal
              onClose={() => setAdding(false)}
              recognize={async (image) => (await api.photoInventory(pid, number, image)).items}
              onSave={async (text, firstDay) => {
                const { created } = await api.createItemsBulk(pid, number, text)
                // вещи первого дня, которые нашла модель, сразу получают пометку
                const marked = created.filter((it) => firstDay.has(it.name.trim().toLowerCase()))
                await Promise.all(marked.map((it) => api.updateItem(pid, it.id, { first_day: true })))
                setAdding(false)
                card.reload()
              }}
            />
          ) : null}
          {editing ? (
            <EditBoxModal
              room={box.room}
              fillLater={box.fill_later}
              onClose={() => setEditing(false)}
              onSave={async (room, later) => { await api.updateBox(pid, number, { room, fill_later: later }); setEditing(false); card.reload() }}
            />
          ) : null}
        </>
      ) : null}
    </StateView>
    </>
  )
}

function AddItemsModal({ onClose, onSave, recognize }: {
  onClose: () => void
  onSave: (text: string, firstDay: Set<string>) => Promise<void>
  recognize: (image: string) => Promise<PhotoItem[]>
}) {
  const [text, setText] = useState('')
  const [firstDay, setFirstDay] = useState<Set<string>>(new Set())
  const [found, setFound] = useState<number | null>(null)
  const { busy, error, submit } = useAction()

  const fromPhoto = async (image: string) => {
    const items = await recognize(image)
    setFound(items.length)
    if (items.length === 0) return
    setText((prev) => [prev.trim(), ...items.map((i) => (i.fragile ? `${i.name} (хрупкое)` : i.name))].filter(Boolean).join('\n'))
    setFirstDay((prev) => new Set([...prev, ...items.filter((i) => i.first_day).map((i) => (i.fragile ? `${i.name} (хрупкое)` : i.name).trim().toLowerCase())]))
  }

  return (
    <Modal title="Добавить вещи" onClose={onClose} dirty={text.trim() !== ''}>
      <form className="stack" onSubmit={submit(() => onSave(text, firstDay))}>
        <label>
          Каждая вещь с новой строки
          <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} data-autofocus />
        </label>
        <PhotoPicker label="Заполнить по фото" busyLabel="Распознаём фото…" onPhoto={fromPhoto} />
        {found !== null ? (
          <p className="muted small" role="status">
            {found === 0 ? 'На фото не нашлось вещей. Попробуйте снять ближе.' : `Добавлено из фото: ${found}. Проверьте список перед сохранением${firstDay.size ? `; вещи первого дня получат пометку (${firstDay.size})` : ''}.`}
          </p>
        ) : null}
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !text.trim()}>Добавить</button>
      </form>
    </Modal>
  )
}

function EditBoxModal({ room: initialRoom, fillLater, onClose, onSave }: { room: string; fillLater: boolean; onClose: () => void; onSave: (room: string, later: boolean) => Promise<void> }) {
  const [room, setRoom] = useState(initialRoom)
  const [later, setLater] = useState(fillLater)
  const { busy, error, submit } = useAction()
  return (
    <Modal title="Изменить коробку" onClose={onClose}>
      <form className="stack" onSubmit={submit(() => onSave(room.trim(), later))}>
        <label>
          Комната назначения
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} data-autofocus />
        </label>
        <label className="row">
          <input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} />
          Заполнить позже
        </label>
        <ErrorAlert message={error} />
        <button className="primary" type="submit" disabled={busy || !room.trim()}>Сохранить</button>
      </form>
    </Modal>
  )
}


function MoveItemModal({ pid, from, item, onClose, onMoved }: { pid: string; from: number; item: Item; onClose: () => void; onMoved: (number: number) => void }) {
  const boxes = useAsync(() => readAllPages(page => api.boxes(pid, { page, page_size: 200 })), [pid])
  const [target, setTarget] = useState('')
  const [query, setQuery] = useState('')
  const { busy, error, submit } = useAction()
  const choices = boxes.data?.filter(box => box.number !== from) ?? []
  const visible = choices.filter(box => `${box.number} ${box.room}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <Modal title={`Переложить «${item.name}»`} onClose={onClose}>
    <form className="stack" onSubmit={submit(async () => { await api.moveItem(pid, item.id, from, Number(target)); onMoved(Number(target)) })}>
      <p className="muted small">Из коробки № {from}. Отметка первого дня и отметки о вещи сохранятся.</p>
      {choices.length > 10 ? <label>Найти коробку<input type="search" value={query} onChange={e => { setQuery(e.target.value); setTarget('') }} placeholder="Номер или комната" /></label> : null}
      <label>В какую коробку<select value={target} onChange={e => setTarget(e.target.value)} disabled={busy || boxes.loading} data-autofocus><option value="">Выберите коробку</option>{visible.map(box => <option key={box.number} value={box.number}>№ {box.number} · {box.room}</option>)}</select></label>
      {boxes.loading ? <p role="status">Загружаем коробки…</p> : null}
      {boxes.data && !choices.length ? <p>Других коробок пока нет. <Link to="/boxes">Добавить коробку</Link></p> : null}
      {choices.length > 0 && !visible.length ? <p>По этому запросу коробок нет.</p> : null}
      <ErrorAlert message={error ?? boxes.error} />
      {boxes.error ? <button type="button" onClick={boxes.reload}>Повторить загрузку</button> : null}
      <button className="primary" disabled={busy || !target || boxes.loading}>Переложить</button>
    </form>
  </Modal>
}
