import type { Crop } from './crop'

export default function PhotoCrop({ src, value, onChange, disabled }: { src: string; value: Crop; onChange: (value: Crop) => void; disabled: boolean }) {
  return <fieldset disabled={disabled} className="recognition-crop stack">
    <legend>Выделите только надпись</legend>
    <div className="recognition-crop-preview">
      <img className="recognition-photo" src={src} alt="Фото номера для проверки" />
      <span aria-hidden="true" style={{ left: `${value.x}%`, top: `${value.y}%`, width: `${value.width}%`, height: `${value.height}%` }} />
    </div>
    <label>Слева, %<input type="range" min="0" max="90" value={value.x} onChange={(e) => { const x = Number(e.target.value); onChange({ ...value, x, width: Math.min(value.width, 100 - x) }) }} /></label>
    <label>Сверху, %<input type="range" min="0" max="90" value={value.y} onChange={(e) => { const y = Number(e.target.value); onChange({ ...value, y, height: Math.min(value.height, 100 - y) }) }} /></label>
    <label>Ширина, %<input type="range" min="10" max={100 - value.x} value={value.width} onChange={(e) => onChange({ ...value, width: Number(e.target.value) })} /></label>
    <label>Высота, %<input type="range" min="10" max={100 - value.y} value={value.height} onChange={(e) => onChange({ ...value, height: Number(e.target.value) })} /></label>
  </fieldset>
}
