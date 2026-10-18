import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../state/ThemeContext'

export default function ThemeToggle() {
  const { theme, setPreference } = useTheme()
  const label = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'
  const Icon = theme === 'dark' ? Sun : Moon
  return <button type="button" className="icon-link theme-toggle" aria-label={label} title={label} onClick={() => setPreference(theme === 'dark' ? 'light' : 'dark')}><Icon className="icon" aria-hidden /></button>
}
