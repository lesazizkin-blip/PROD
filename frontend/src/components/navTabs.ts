import { Calculator, ChartColumn, ClipboardList, Package, QrCode, Route, Truck, Wallet } from 'lucide-react'

/** Разделы в меню слева (на телефоне - вкладки снизу). Один список для вошедшего и для гостя. */
export const NAV_TABS = [
  { to: '/', label: 'План переезда', short: 'План', icon: ClipboardList, end: true },
  { to: '/boxes', label: 'Коробки и поиск', short: 'Коробки', icon: Package, end: false },
  { to: '/labels', label: 'QR-этикетки', short: 'Этикетки', icon: QrCode, end: false },
  { to: '/progress', label: 'Прогресс', short: 'Прогресс', icon: ChartColumn, end: false },
] as const

/** Номер раздела в меню, как в макете: 01, 02, ... */
export const tabNumber = (i: number) => String(i + 1).padStart(2, '0')

/** Группа «Путь переезда» в меню слева (только на ноутбуке: нижняя панель телефона рассчитана на 4 вкладки).
 *  guest: страница открыта и без входа. */
export const JOURNEY_TABS = [
  { to: '/journey', label: 'Путь переезда', icon: Route, guest: true },
  { to: '/calculator', label: 'Калькулятор', icon: Calculator, guest: true },
  { to: '/budget', label: 'Бюджет', icon: Wallet, guest: false },
  { to: '/moving-day', label: 'День переезда', icon: Truck, guest: false },
] as const
