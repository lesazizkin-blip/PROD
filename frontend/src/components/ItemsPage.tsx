import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, api, isAbort } from '../api'
import { STATUS_LABEL, formatDate, formatMoney } from '../labels'
import type { Item, ItemList, Status, User } from '../types'
import ItemForm from './ItemForm'
import ItemModal from './ItemModal'
import Modal from './Modal'
import StatsBar from './StatsBar'
import StatusBadge from './StatusBadge'

const PAGE_SIZE = 10
const HASH_RE = /^#\/items\/(\d+)$/

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Открытая запись живёт в адресе (#/items/12): кнопка «Назад» закрывает окно, F5 и ссылка работают
const idFromHash = () => {
  const m = HASH_RE.exec(location.hash)
  return m ? Number(m[1]) : null
}

export default function ItemsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [status, setStatus] = useState<Status | ''>('')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  // Страница привязана к фильтрам: при смене статуса или поиска она сама становится первой
  // (без эффекта и без лишнего запроса со старым поиском)
  const filterKey = `${status}|${q}`
  const [paging, setPaging] = useState({ key: filterKey, offset: 0 })
  const offset = paging.key === filterKey ? paging.offset : 0
  const setOffset = (o: number) => setPaging({ key: filterKey, offset: o })

  const [reloadKey, setReloadKey] = useState(0) // растёт после изменений: перезагружает список и сводку
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const requestKey = `${filterKey}|${offset}|${reloadKey}`

  const [result, setResult] = useState<{ key: string; data: ItemList } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [createDirty, setCreateDirty] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(idFromHash)
  const openedByPush = useRef(false)

  // Один запрос на комбинацию параметров; устаревший отменяется и не может перезаписать новый
  useEffect(() => {
    const ctrl = new AbortController()
    api
      .listItems({ status, q, limit: PAGE_SIZE, offset }, ctrl.signal)
      .then((data) => {
        // Страницы больше нет (например, согласовали последнюю запись при фильтре): идём на последнюю
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE)
          return
        }
        setResult({ key: requestKey, data })
      })
      .catch((e) => {
        if (isAbort(e)) return
        setFailure({ key: requestKey, message: e instanceof ApiError ? e.message : 'Не удалось загрузить данные' })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOffset пересоздаётся каждый рендер, ключ запроса его уже учитывает
  }, [status, q, offset, requestKey])

  useEffect(() => {
    const onHash = () => setSelectedId(idFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const openItem = (id: number) => {
    openedByPush.current = true
    location.hash = `/items/${id}`
  }
  const closeItem = () => {
    if (openedByPush.current) {
      openedByPush.current = false
      history.back() // убираем запись из истории: «Назад» не возвращает в закрытое окно
    } else {
      history.replaceState(null, '', location.pathname + location.search)
      setSelectedId(null)
    }
  }

  const loading = result?.key !== requestKey && failure?.key !== requestKey
  const data = result?.data
  const items: Item[] = data?.items ?? []
  const total = data?.total ?? 0
  const error = failure?.key === requestKey ? failure.message : ''
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="layout">
      <header className="topbar">
        <strong>Согласование</strong>
        <div className="row">
          <span className="muted hide-sm">
            {user.full_name}
            {user.role === 'admin' && ' · администратор'}
          </span>
          <button onClick={onLogout}>Выйти</button>
        </div>
      </header>

      <main className="container">
        <StatsBar version={reloadKey} />
        <div className="toolbar">
          <input
            type="search"
            placeholder="Поиск по названию и описанию"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск"
          />
          <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')} aria-label="Статус">
            <option value="">Все статусы</option>
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button className="primary" onClick={() => setCreating(true)}>
            + Создать
          </button>
        </div>

        {error && (
          <div className="alert" role="alert">
            {error} <button onClick={reload}>Повторить</button>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="center muted">Загрузка…</div>
        ) : items.length === 0 && !error ? (
          <div className="card empty">
            <p>{q || status ? 'Ничего не найдено по этим условиям.' : 'Пока нет ни одной записи.'}</p>
            {(q || status) && (
              <button
                onClick={() => {
                  setSearch('')
                  setStatus('')
                }}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        ) : (
          <ul className={`list ${loading ? 'dim' : ''}`}>
            {items.map((it) => (
              <li key={it.id}>
                <button className="card item" onClick={() => openItem(it.id)}>
                  <span className="item-head">
                    <strong>{it.title}</strong>
                    <StatusBadge status={it.status} />
                  </span>
                  <span className="muted small">
                    {formatMoney(it.amount)} · {it.owner_name} · {formatDate(it.updated_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="pager">
            <button disabled={offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>
              ← Назад
            </button>
            <span className="muted">
              {page} / {pages}
            </span>
            <button disabled={page >= pages} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Вперёд →
            </button>
          </div>
        )}
      </main>

      {creating && (
        <Modal title="Новая запись" dirty={createDirty} onClose={() => setCreating(false)}>
          <ItemForm
            onDirtyChange={setCreateDirty}
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false)
              setOffset(0)
              reload()
            }}
          />
        </Modal>
      )}
      {selectedId !== null && (
        <ItemModal itemId={selectedId} user={user} onClose={closeItem} onChanged={reload} />
      )}
    </div>
  )
}
