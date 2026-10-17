import { useRef, type PointerEvent } from 'react'
import { cropFromPoints, FULL_CROP, type Crop } from './crop'
import './crop.css'

export default function PhotoCrop({ src, value, onChange, disabled }: { src: string; value: Crop; onChange: (value: Crop) => void; disabled: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / bounds.width * 100, y: (event.clientY - bounds.top) / bounds.height * 100 }
  }
  const update = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current || disabled) return
    const end = point(event)
    if (Math.abs(end.x - start.current.x) > 1 || Math.abs(end.y - start.current.y) > 1) onChange(cropFromPoints(start.current, end))
  }
  return <fieldset disabled={disabled} className="recognition-crop stack">
    <legend>Выделите цифры номера</legend>
    <p className="small">Обведите цифры мышью или пальцем. Знак # можно оставить за рамкой. Для точной настройки используйте ползунки.</p>
    <div className="recognition-crop-preview" aria-label="Область номера на фото"
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return
        start.current = point(event)
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
      }}
      onPointerMove={update}
      onPointerUp={event => { update(event); start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { start.current = null }}>
      <img className="recognition-photo" src={src} alt="Фото номера для проверки" draggable={false} />
      <span aria-hidden="true" style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.width}%`, height: `${value.height}%` }} />
    </div>
    <button type="button" onClick={() => onChange(FULL_CROP)}>Всё фото</button>
    <details><summary>Точная настройка области</summary><div className="stack">
    <label>Слева, %<input type="range" min="0" max="99" step="0.1" value={value.x} onChange={(e) => { const x = Number(e.target.value); onChange({ ...value, x, width: Math.min(value.width, 100 - x) }) }} /></label>
    <label>Сверху, %<input type="range" min="0" max="99" step="0.1" value={value.y} onChange={(e) => { const y = Number(e.target.value); onChange({ ...value, y, height: Math.min(value.height, 100 - y) }) }} /></label>
    <label>Ширина, %<input type="range" min="1" step="0.1" max={100 - value.x} value={value.width} onChange={(e) => onChange({ ...value, width: Number(e.target.value) })} /></label>
    <label>Высота, %<input type="range" min="1" step="0.1" max={100 - value.y} value={value.height} onChange={(e) => onChange({ ...value, height: Number(e.target.value) })} /></label>
    </div></details>
  </fieldset>
}
