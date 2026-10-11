import { useEffect, useState } from 'react'
import { api } from '../api'
import { STATUS_LABEL } from '../labels'
import type { Stats, Status } from '../types'

// Сводка по статусам. `version` меняется после действий - тогда цифры обновляются
export default function StatsBar({ version }: { version: number }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    api.stats().then(setStats).catch(() => setStats(null))
  }, [version])

  if (!stats) return null
  const shown: Status[] = ['in_review', 'changes_requested', 'approved', 'rejected']
  return (
    <div className="stats" aria-label="Сводка">
      <div className="stat">
        <b>{stats.total}</b>
        <span>всего</span>
      </div>
      {shown.map((s) => (
        <div className="stat" key={s}>
          <b>{stats.by_status[s]}</b>
          <span>{STATUS_LABEL[s].toLowerCase()}</span>
        </div>
      ))}
      {stats.approval_rate !== null && (
        <div className="stat">
          <b>{Math.round(stats.approval_rate * 100)}%</b>
          <span>согласовано из решённых</span>
        </div>
      )}
    </div>
  )
}
