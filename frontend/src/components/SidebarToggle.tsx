import { ChevronLeft, PanelLeftOpen } from 'lucide-react'

export default function SidebarToggle({ compact, onToggle }: { compact: boolean; onToggle: () => void }) {
  return <button type="button" className="sidebar-toggle" onClick={onToggle} aria-expanded={!compact} aria-controls="sidebar-navigation" aria-label={compact ? 'Развернуть меню' : 'Свернуть меню'} title={compact ? 'Развернуть меню' : 'Свернуть меню'}>
    {compact ? <PanelLeftOpen className="icon" aria-hidden="true" /> : <ChevronLeft className="icon" aria-hidden="true" />}
  </button>
}
