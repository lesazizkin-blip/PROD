import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import { google, mapTiler, type Geocoder, type MapsProvider, type Place, type Suggestion } from '../ui/geocoders'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

interface MapsConfig {
  provider: MapsProvider
  key: string
}

// какой сервис подсказок включён, спрашиваем у сервера один раз; нет ключа или ошибка - обычное поле адреса
let configRequest: Promise<MapsConfig | null> | null = null
const mapsConfig = () =>
  (configRequest ??= Promise.resolve()
    .then(() => api.config())
    .then((c) => (c.maps_api_key && c.maps_provider ? { provider: c.maps_provider, key: c.maps_api_key } : null))
    .catch(() => null))

/** Поле адреса. Если на сервере задан ключ MapTiler или Google, по кнопке «Найти на карте» появляются
 *  подсказки адреса и карта с меткой. Без нажатия кнопки адрес никуда не отправляется. */
export default function AddressInput({ label, value, onChange, placeholder }: Props) {
  const config = useAsync(mapsConfig, [])
  const [geo, setGeo] = useState<Geocoder | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [place, setPlace] = useState<Place | null>(null)
  const [typed, setTyped] = useState(false) // подсказки только на ввод пользователя, не на подставленный адрес
  const mapEl = useRef<HTMLDivElement>(null)
  const query = useDebounced(value.trim(), 350)

  const enable = async () => {
    const c = config.data
    if (!c) return
    setLoading(true)
    setError(null)
    try {
      setGeo(c.provider === 'maptiler' ? mapTiler(c.key) : await google(c.key))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Карта недоступна')
    } finally {
      setLoading(false)
    }
  }

  // подсказки адреса после паузы в наборе
  useEffect(() => {
    if (!geo || !typed || query.length < 3) return
    let cancelled = false
    geo.suggest(query)
      .then((list) => !cancelled && setSuggestions(list))
      .catch(() => !cancelled && setError('Подсказки адреса сейчас недоступны'))
    return () => {
      cancelled = true
    }
  }, [geo, query, typed])

  // карта, которую рисует сам провайдер (Google); у MapTiler - картинка ниже
  useEffect(() => {
    if (geo?.drawMap && place && mapEl.current) void geo.drawMap(mapEl.current, place)
  }, [geo, place])

  const pick = async (s: Suggestion) => {
    if (!geo) return
    setSuggestions([])
    setTyped(false)
    try {
      const p = await geo.resolve(s)
      onChange(p?.address ?? s.text)
      setPlace(p)
    } catch {
      onChange(s.text)
    }
  }

  const visible = geo && typed && query.length >= 3 ? suggestions : []
  const image = geo && place ? geo.mapImage(place) : null

  return (
    <div className="address-input">
      <label>
        {label}
        <input
          value={value}
          onChange={(e) => {
            setTyped(true)
            setPlace(null)
            onChange(e.target.value)
          }}
          maxLength={300}
          placeholder={placeholder}
          autoComplete="off"
          role={geo ? 'combobox' : undefined}
          aria-expanded={geo ? visible.length > 0 : undefined}
        />
      </label>
      {visible.length ? (
        <ul className="address-input__list" role="listbox">
          {visible.map((s) => (
            <li key={s.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => void pick(s)}>
                <MapPin className="icon-sm" aria-hidden />{s.text}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {config.data && !geo ? (
        <button type="button" className="link small" disabled={loading} onClick={() => void enable()}>
          <MapPin className="icon-sm" aria-hidden />{loading ? 'Загружаем карту…' : 'Найти на карте'}
        </button>
      ) : null}
      {geo ? <p className="muted small">Подсказки адреса — {geo.service}: введённый адрес отправляется в {geo.service}.</p> : null}
      {error ? <p className="error-text small" role="status">{error}</p> : null}
      {image ? (
        <img className="address-input__map" src={image} alt={`Карта: ${value}`} onError={(e) => { e.currentTarget.hidden = true }} />
      ) : place && geo?.drawMap ? (
        <div ref={mapEl} className="address-input__map" role="img" aria-label={`Карта: ${value}`} />
      ) : null}
    </div>
  )
}
