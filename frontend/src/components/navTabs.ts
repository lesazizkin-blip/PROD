import { ChartColumn, ClipboardList, Package, QrCode } from 'lucide-react'

/** Разделы в меню слева (на телефоне - вкладки снизу). Один список для вошедшего и для гостя. */
export const NAV_TABS = [
  { to: '/', label: 'План', icon: ClipboardList, end: true },
  { to: '/boxes', label: 'Коробки', icon: Package, end: false },
  { to: '/labels', label: 'Этикетки', icon: QrCode, end: false },
  { to: '/progress', label: 'Прогресс', icon: ChartColumn, end: false },
] as const
