export default function Pagination({ page, pageSize, total, busy = false, onChange, label = 'Страницы' }: { page: number; pageSize: number; total: number; busy?: boolean; onChange: (page: number) => void; label?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return <nav className="pagination" aria-label={label}>
    <span className="muted small" aria-live="polite">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total} · Страница {page} из {pages}</span>
    <div className="row"><button type="button" disabled={busy || page <= 1} onClick={() => onChange(page - 1)}>Назад</button><button type="button" disabled={busy || page >= pages} onClick={() => onChange(page + 1)}>Далее</button></div>
  </nav>
}
