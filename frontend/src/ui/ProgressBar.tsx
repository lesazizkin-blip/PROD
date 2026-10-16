/** Полоса прогресса с доступным именем: экранный диктор читает «label: N%». */
export default function ProgressBar({ value, max = 100, label, color }: { value: number; max?: number; label: string; color?: string }) {
  const percent = max > 0 ? Math.round((100 * value) / max) : 0
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${percent}%`}>
      <span style={{ width: `${percent}%`, background: color }} />
    </div>
  )
}
