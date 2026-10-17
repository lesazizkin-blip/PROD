import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'
import { api } from '../api/endpoints'
import { useAsync } from '../state/useAsync'
import { useDebounced } from '../state/useDebounced'
import { loadGoogleMaps, type GoogleMaps, type LatLng, type PlacePrediction } from '../ui/googleMaps'

interface Props {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

// ключ спрашиваем у сервера один раз; если его нет или запрос не удался - обычное поле адреса
let configRequest: Promise<string | null> | null = null
const mapsKey = () =>
  (configRequest ??= Promise.resolve()
    .then(() => api.config())
    .then((c) => c.maps_api_key)
    .catch(() => null))

/** Поле адреса. Если на сервере задан ключ Google Maps, по кнопке «Найти на карте» появляются подсказки
 *  адреса и карта с меткой. Без нажатия кнопки адрес в Google не отправляется. */
export default function AddressInput({ label, value, onChange, placeholder }: Props) {
  const key = useAsync(mapsKey, [])
  const [maps, setMaps] = useState<GoogleMaps | null>(null)
  const [loadingMaps, setLoadingMaps] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<PlacePrediction[]>([])
  const [location, setLocation] = useState<LatLng | null>(null)
  const [typed, setTyped] = useState(false) // подсказки только на ввод пользователя, не на подставленный адрес
  const token = useRef<unknown>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const query = useDebounced(value.trim(), 350)

  const enable = async () => {
    if (!key.data) return
    setLoadingMaps(true)
    setError(null)
    try {
      setMaps(await loadGoogleMaps(key.data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google Maps недоступен')
    } finally {
      setLoadingMaps(false)
    }
  }

  // подсказки адреса после паузы в наборе
  useEffect(() => {
    if (!maps || !typed || query.length < 3) return
    let cancelled = false
    void maps.importLibrary('places').then(async (places) => {
      token.current ??= new places.AutocompleteSessionToken()
      const r = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, language: 'ru', region: 'ru', sessionToken: token.current })
      if (!cancelled) setSuggestions(r.suggestions.map((s) => s.placePrediction).filter((p): p is PlacePrediction => !!p).slice(0, 5))
    }).catch(() => !cancelled && setError('Подсказки адреса сейчас недоступны'))
    return () => {
      cancelled = true
    }
  }, [maps, query, typed])

  // карта с меткой выбранного места
  useEffect(() => {
    if (!maps || !location || !mapEl.current) return
    const el = mapEl.current
    void Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')]).then(([m, mk]) => {
      const map = new m.Map(el, { center: location, zoom: 16, disableDefaultUI: true, clickableIcons: false })
      new mk.Marker({ position: location, map })
    })
  }, [maps, location])

  const pick = async (p: PlacePrediction) => {
    setSuggestions([])
    setTyped(false)
    const place = p.toPlace()
    try {
      await place.fetchFields({ fields: ['formattedAddress', 'location'] })
      onChange(place.formattedAddress ?? p.text.toString())
      setLocation(place.location ?? null)
    } catch {
      onChange(p.text.toString())
    }
    token.current = null // одна сессия подсказок = один выбранный адрес
  }

  const visible = maps && typed && query.length >= 3 ? suggestions : []

  return (
    <div className="address-input">
      <label>
        {label}
        <input
          value={value}
          onChange={(e) => {
            setTyped(true)
            setLocation(null)
            onChange(e.target.value)
          }}
          maxLength={300}
          placeholder={placeholder}
          autoComplete="off"
          role={maps ? 'combobox' : undefined}
          aria-expanded={maps ? visible.length > 0 : undefined}
        />
      </label>
      {visible.length ? (
        <ul className="address-input__list" role="listbox">
          {visible.map((s) => (
            <li key={s.text.toString()}>
              <button type="button" role="option" aria-selected={false} onClick={() => void pick(s)}>
                <MapPin className="icon-sm" aria-hidden />{s.text.toString()}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {key.data && !maps ? (
        <button type="button" className="link small" disabled={loadingMaps} onClick={() => void enable()}>
          <MapPin className="icon-sm" aria-hidden />{loadingMaps ? 'Загружаем карту…' : 'Найти на карте'}
        </button>
      ) : null}
      {maps ? <p className="muted small">Подсказки адреса — Google Maps: введённый адрес отправляется в Google.</p> : null}
      {error ? <p className="error-text small" role="status">{error}</p> : null}
      {location ? <div ref={mapEl} className="address-input__map" role="img" aria-label={`Карта: ${value}`} /> : null}
    </div>
  )
}
