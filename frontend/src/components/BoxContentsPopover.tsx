import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'
import { itemPreviewText } from '../ui/boxContents'
import { plural } from '../ui/format'

export type BoxPreviewAnchor = { rect: DOMRect; side: 'left' | 'right' }

export default function BoxContentsPopover({ id, pid, number, room, anchor, onClose }: {
  id: string; pid: string; number: number; room: string; anchor: BoxPreviewAnchor
  onClose: () => void
}) {
  const card = useAsync(() => api.getBox(pid, number), [pid, number])
  const panel = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', escape)
    window.addEventListener('scroll', onClose)
    window.addEventListener('resize', onClose)
    return () => { window.removeEventListener('keydown', escape); window.removeEventListener('scroll', onClose); window.removeEventListener('resize', onClose) }
  }, [onClose])
  const margin = 12, gap = 12, minWidth = 240
  const viewportWidth = document.documentElement.clientWidth
  const spaces = { left: Math.max(0, anchor.rect.left - gap - margin), right: Math.max(0, viewportWidth - anchor.rect.right - gap - margin) }
  const opposite = anchor.side === 'left' ? 'right' : 'left'
  const side = spaces[anchor.side] >= minWidth ? anchor.side : spaces[opposite] >= minWidth ? opposite : null
  const width = Math.min(320, side ? spaces[side] : viewportWidth - 2 * margin)
  const candidateLeft = side === 'left' ? anchor.rect.left - gap - width : side === 'right' ? anchor.rect.right + gap : anchor.rect.left + (anchor.rect.width - width) / 2
  const left = Math.max(margin, Math.min(candidateLeft, viewportWidth - width - margin))
  const candidateTop = side ? anchor.rect.top : anchor.rect.bottom + gap + height <= window.innerHeight - margin ? anchor.rect.bottom + gap : anchor.rect.top - gap - height
  const top = Math.max(margin, Math.min(candidateTop, window.innerHeight - height - margin))
  const previewLimit = Math.min(8, Math.max(1, Math.floor((window.innerHeight - 156) / 27)))
  useLayoutEffect(() => { setHeight(panel.current?.getBoundingClientRect().height ?? 0) }, [card.data, card.loading, card.error, width])
  return createPortal(<div ref={panel} id={id} role="tooltip" className="box-contents-popover" data-side={side ?? 'vertical'} style={{ left, top, width }}>
    <b>№ {number} · {room}</b>
    {card.loading ? <p role="status">Загружаем содержимое…</p> : card.error ? <p>Не удалось загрузить опись. Откройте коробку, чтобы повторить.</p> : card.data?.items.length ? <>
      <p className="muted small">{card.data.items.length} {plural(card.data.items.length, ['позиция', 'позиции', 'позиций'])}</p>
      <ul>{card.data.items.slice(0, previewLimit).map(item => <li key={item.id}>{itemPreviewText(item)}</li>)}</ul>
      {card.data.items.length > previewLimit ? <p className="muted small">Ещё {card.data.items.length - previewLimit} в описи коробки</p> : null}
    </> : <p className="muted">{card.data?.fill_later ? 'Опись добавим позже' : 'Пока пусто'}</p>}
  </div>, document.body)
}
