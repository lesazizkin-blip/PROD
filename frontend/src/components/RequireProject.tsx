import type { ReactNode } from 'react'
import { useProjects } from '../state/ProjectContext'
import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, Package, QrCode, ChartColumn, Plus, Truck, Wallet, ArchiveRestore } from 'lucide-react'

/** Страницы проекта: пока список грузится - ждём, если проектов нет - предлагаем создать. */
export default function RequireProject({ children, pid }: { pid?: string; children: (pid: string) => ReactNode }) {
  const { currentId, ready, projects, archivedIds = [], archiveProject } = useProjects()
  const { pathname } = useLocation()
  if (!ready) return <div className="state" role="status"><span className="spinner" /> Загрузка…</div>
  const archivedProject = pid && archivedIds.includes(pid) ? projects.find(project => project.id === pid) : null
  if (archivedProject) return <section className="project-empty stack">
    <ArchiveRestore className="project-empty__icon" aria-hidden /><h1>Проект в архиве</h1>
    <p className="muted">«{archivedProject.name}» убран из активных проектов. Восстановите его, чтобы работать с коробками, планом и настройками.</p>
    <div className="row wrap"><button className="primary" onClick={() => archiveProject(archivedProject.id, false)}>Восстановить проект</button><Link to="/projects?tab=archive" className="button">Открыть архив</Link></div>
  </section>
  const selected = pid ?? currentId
  if (selected && !archivedIds.includes(selected)) return <>{children(selected)}</>
  const hasArchived = projects.some(project => archivedIds.includes(project.id))
  const section = pathname.startsWith('/budget') ? { title: 'Бюджет переезда', text: 'Здесь будут план расходов, оплаты и отклонения от сметы.', icon: Wallet } : pathname.startsWith('/moving-day') ? { title: 'День переезда', text: 'Здесь можно отмечать погрузку и доставку коробок по номерам.', icon: Truck } : pathname.startsWith('/boxes') ? { title: 'Коробки и поиск', text: 'Здесь будут коробки, комнаты и поиск вещей.', icon: Package } : pathname.startsWith('/labels') ? { title: 'QR-этикетки', text: 'Здесь можно подготовить и напечатать этикетки для коробок.', icon: QrCode } : pathname.startsWith('/progress') ? { title: 'Прогресс переезда', text: 'Здесь появятся погрузка, доставка и распаковка коробок.', icon: ChartColumn } : { title: 'План переезда', text: 'Здесь будут задачи со сроками и список первого дня.', icon: ClipboardList }
  return <section className="project-empty stack">
    <section.icon className="project-empty__icon" aria-hidden /><h1>{section.title}</h1><p className="muted">{hasArchived ? 'Нет активного проекта. Восстановите переезд из архива или создайте новый.' : `${section.text} Создайте первый проект, чтобы начать.`}</p>
    <div className="row wrap"><Link to="/new" className="button primary"><Plus className="icon-sm" aria-hidden />Создать проект</Link><Link to={hasArchived ? '/projects?tab=archive' : '/projects'} className="button">{hasArchived ? 'Открыть архив' : 'Все проекты'}</Link></div>
  </section>
}
