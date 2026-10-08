import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import { STATUS_LABEL, formatDate, formatMoney } from '../labels'
import type { Item, Status, User } from '../types'
import ItemForm from './ItemForm'
import ItemModal from './ItemModal'
import StatusBadge from './StatusBadge'

const PAGE_SIZE = 10

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function ItemsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<Status | ''>('')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listItems({ status, q, limit: PAGE_SIZE, offset })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [status, q, offset])

  useEffect(() => {
    // Загрузка при смене фильтров - синхронизация с внешним источником (API)
    // oxlint-disable-next-line react/set-state-in-effect
    load()
  }, [load])

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
        <div className="toolbar">
          <input
            type="search"
            placeholder="Поиск по названию и описанию"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOffset(0) // новый поиск - с первой страницы
            }}
            aria-label="Поиск"
          />
          <select value={status} onChange={(e) => {
              setStatus(e.target.value as Status | '')
              setOffset(0)
            }}
            aria-label="Статус">
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
          <div className="alert">
            {error} <button onClick={load}>Повторить</button>
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
                  setOffset(0)
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
                <button className="card item" onClick={() => setSelected(it)}>
                  <div className="item-head">
                    <strong>{it.title}</strong>
                    <StatusBadge status={it.status} />
                  </div>
                  <div className="muted small">
                    {formatMoney(it.amount)} · {it.owner_name} · {formatDate(it.updated_at)}
                  </div>
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
        <div className="overlay" onClick={() => setCreating(false)}>
          <div className="modal card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Новая запись</h2>
            <ItemForm
              onCancel={() => setCreating(false)}
              onSaved={() => {
                setCreating(false)
                setOffset(0)
                load()
              }}
            />
          </div>
        </div>
      )}
      {selected && <ItemModal item={selected} user={user} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  )
}
