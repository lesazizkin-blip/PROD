import { canAdvanceBox } from '../../components/statusOptions'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { api } from '../../api/endpoints'
import { BOX_STATUSES, type Box, type BoxStatus } from '../../api/types'
import PageHeading from '../../components/PageHeading'
import RequireProject from '../../components/RequireProject'
import { useAsync } from '../../state/useAsync'
import ProgressBar from '../../ui/ProgressBar'
import StateView from '../../ui/StateView'
import StatusBadge from '../../ui/StatusBadge'
import { boxPath } from '../../ui/format'
import './journey.css'

type Mode = 'load' | 'accept'
const TARGET: Record<Mode, BoxStatus> = { load: 'loaded', accept: 'delivered' }
const reached = (status: BoxStatus, target: BoxStatus) => BOX_STATUSES.indexOf(status) >= BOX_STATUSES.indexOf(target)

/** Все коробки проекта: сервер отдаёт до 200 за раз, в больших переездах их больше. */
async function allBoxes(pid: string): Promise<{ items: Box[] }> {
  const items: Box[] = []
  for (let page = 1; ; page++) {
    const chunk = await api.boxes(pid, { page, page_size: 200 })
    items.push(...chunk.items)
    if (items.length >= chunk.total || chunk.items.length === 0) break
  }
  return { items }
}

export default function MovingDayPage() {
  return <RequireProject>{(pid) => <MovingDay pid={pid} />}</RequireProject>
}

/** Режим «День X»: погрузка и приёмка по номеру с этикетки (вручную или ручным сканером - он «печатает» номер). */
function MovingDay({ pid }: { pid: string }) {
  const boxes = useAsync(() => allBoxes(pid), [pid])
  const [mode, setMode] = useState<Mode>('load')
  const [number, setNumber] = useState('')
  const [feed, setFeed] = useState<{ text: string; ok: boolean }[]>([])
  const input = useRef<HTMLInputElement>(null)
  const list = boxes.data?.items ?? []
  const target = TARGET[mode]
  const done = list.filter((b) => reached(b.status, target))
  const missing = list.filter((b) => !reached(b.status, target))

  const note = (text: string, ok: boolean) => setFeed((f) => [{ text, ok }, ...f].slice(0, 6))

  const mark = async (n: number) => {
    const box = list.find((b) => b.number === n)
    if (!box) return note(`Коробки № ${n} нет в этом проекте`, false)
    if (reached(box.status, target)) return note(`№ ${n} (${box.room}) уже ${mode === 'load' ? 'погружена' : 'принята'}`, true)
    try {
      await api.transition(pid, n, target)
      boxes.mutate((all) => all ? { items: all.items.map((b: Box) => (b.number === n ? { ...b, status: target } : b)) } : all)
      note(`№ ${n} (${box.room}) ${mode === 'load' ? 'погружена' : 'принята'}`, true)
    } catch (e) {
      note(`№ ${n}: ${errorMessage(e)}`, false)
    }
  }

  return (
    <div className="stack journey">
      <PageHeading title="День переезда">Погрузка и приёмка по номерам коробок: ничего не забыть в старой квартире и ничего не потерять в дороге.</PageHeading>
      <div className="segmented stage-tabs" role="tablist" aria-label="Режим">
        <button type="button" role="tab" aria-selected={mode === 'load'} className={mode === 'load' ? 'on' : ''} onClick={() => setMode('load')}>Погрузка</button>
        <button type="button" role="tab" aria-selected={mode === 'accept'} className={mode === 'accept' ? 'on' : ''} onClick={() => setMode('accept')}>Приёмка</button>
      </div>
      <StateView loading={boxes.loading && !boxes.data} error={boxes.error} empty={list.length === 0} emptyText="Коробок пока нет" onRetry={boxes.reload}>
        <div className="move-ticket day-x">
          <div className="stack grow">
            <span className="eyebrow">{mode === 'load' ? 'Погружено' : 'Принято на новом месте'}</span>
            <h2>{done.length} из {list.length}</h2>
            <ProgressBar value={done.length} max={list.length} label={mode === 'load' ? 'Погружено коробок' : 'Принято коробок'} />
          </div>
          <form className="day-x__scan" onSubmit={(e) => {
            e.preventDefault()
            const n = Number(number.replace(/\D/g, ''))
            setNumber('')
            input.current?.focus()
            if (n > 0) void mark(n)
          }}>
            <label>Номер коробки
              <input ref={input} inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="017" autoFocus />
            </label>
            <button className="primary" type="submit" disabled={!number.trim()}>{mode === 'load' ? 'Погружена' : 'Принята'}</button>
          </form>
        </div>
        {feed.length ? (
          <ul className="plain day-x__feed" aria-live="polite">
            {feed.map((f, i) => <li key={i} className={f.ok ? 'ok' : 'bad'}>{f.text}</li>)}
          </ul>
        ) : null}
        <h2>{missing.length === 0 ? (mode === 'load' ? 'Всё погружено' : 'Всё доехало') : mode === 'load' ? `Осталось погрузить: ${missing.length}` : `Не хватает: ${missing.length}`}</h2>
        {missing.length ? (
          <div className="card flush">
            {missing.map((b) => (
              <div key={b.number} className="list-row">
                <span className="grow"><Link to={boxPath(pid, b.number)}><b>№ {b.number}</b></Link> <span className="sub">{b.room} · {b.items_count} вещ.</span></span>
                <StatusBadge status={b.status} />
                <button className="small" disabled={!canAdvanceBox(b.status, target)} title={!canAdvanceBox(b.status, target) ? 'Сначала завершите предыдущий этап в карточке коробки' : undefined} onClick={() => void mark(b.number)}>{mode === 'load' ? 'Погружена' : 'Принята'}</button>
              </div>
            ))}
          </div>
        ) : null}
        <p className="muted small">Повреждения отмечайте в карточке коробки: статус вещи «Повреждена». Перед закрытием двери — счётчики, ключи, балкон.</p>
      </StateView>
    </div>
  )
}
