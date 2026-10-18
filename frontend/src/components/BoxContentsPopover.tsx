import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'
import { itemPreviewText } from '../ui/boxContents'
import { plural } from '../ui/format'

export default function BoxContentsPopover({ id, pid, number, room, anchor, onClose, onPointerEnter, onPointerLeave }: {
  id: string; pid: string; number: number; room: string; anchor: DOMRect
  onClose: () => void; onPointerEnter: () => void; onPointerLeave: () => void
}) {
  const card = useAsync(() => api.getBox(pid, number), [pid, number])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    window.addEventListener('scroll', onClose)
    window.addEventListener('resize', onClose)
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('scroll', onClose); window.removeEventListener('resize', onClose) }
  }, [onClose])
  const left = Math.max(12, Math.min(anchor.right + 12, window.innerWidth - 332))
  const top = Math.max(12, Math.min(anchor.top, window.innerHeight - 360))
  return createPortal(<div id={id} role="tooltip" className="box-contents-popover" style={{ left, top }} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
    <b>№ {number} · {room}</b>
    {card.loading ? <p role="status">Загружаем содержимое…</p> : card.error ? <p>Не удалось загрузить опись. Откройте коробку, чтобы повторить.</p> : card.data?.items.length ? <>
      <p className="muted small">{card.data.items.length} {plural(card.data.items.length, ['позиция', 'позиции', 'позиций'])}</p>
      <ul>{card.data.items.map(item => <li key={item.id}>{itemPreviewText(item)}</li>)}</ul>
    </> : <p className="muted">{card.data?.fill_later ? 'Опись добавим позже' : 'Пока пусто'}</p>}
  </div>, document.body)
}
