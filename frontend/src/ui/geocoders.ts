// Подсказки адреса от внешнего сервиса. Подключаются только по кнопке пользователя «Найти на карте»:
// до этого введённый адрес никуда не уходит. Провайдера выбирает сервер (/api/config).
import { loadGoogleMaps, type PlacePrediction } from './googleMaps'

export type MapsProvider = 'maptiler' | 'google'

export interface Suggestion {
  id: string
  text: string
}

export interface Place {
  address: string
  lat: number
  lng: number
}

export interface Geocoder {
  /** Название сервиса для предупреждения «адрес отправляется в …» */
  service: string
  suggest(query: string): Promise<Suggestion[]>
  resolve(s: Suggestion): Promise<Place | null>
  /** Картинка карты с меткой; null - карту рисует сам провайдер в элементе (Google) */
  mapImage(p: Place): string | null
  drawMap?(el: HTMLElement, p: Place): Promise<void>
}

// ---------- MapTiler: Geocoding API и Static Maps API, обычные запросы fetch ----------
interface MapTilerFeature {
  id: string
  place_name: string
  center: [number, number]
}

export function mapTiler(key: string): Geocoder {
  const found = new Map<string, MapTilerFeature>()
  return {
    service: 'MapTiler',
    async suggest(query) {
      const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(key)}&language=ru&autocomplete=true&limit=5`
      const r = await fetch(url)
      if (!r.ok) throw new Error(`MapTiler ответил ${r.status}`)
      const data = (await r.json()) as { features?: MapTilerFeature[] }
      return (data.features ?? []).map((f) => {
        found.set(f.id, f)
        return { id: f.id, text: f.place_name }
      })
    },
    async resolve(s) {
      const f = found.get(s.id)
      return f ? { address: f.place_name, lng: f.center[0], lat: f.center[1] } : null
    },
    mapImage(p) {
      const at = `${p.lng},${p.lat}`
      return `https://api.maptiler.com/maps/streets-v2/static/${at},16/600x240.png?key=${encodeURIComponent(key)}&markers=${at},%230f766e`
    },
  }
}

// ---------- Google: Places API (New) и карта Maps JavaScript API ----------
export async function google(key: string): Promise<Geocoder> {
  const maps = await loadGoogleMaps(key)
  const places = await maps.importLibrary('places')
  let token: unknown = null
  const found = new Map<string, PlacePrediction>()
  return {
    service: 'Google',
    async suggest(query) {
      token ??= new places.AutocompleteSessionToken()
      const r = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, language: 'ru', region: 'ru', sessionToken: token })
      return r.suggestions
        .map((x) => x.placePrediction)
        .filter((p): p is PlacePrediction => !!p)
        .slice(0, 5)
        .map((p) => {
          const text = p.text.toString()
          found.set(text, p)
          return { id: text, text }
        })
    },
    async resolve(s) {
      const p = found.get(s.id)
      token = null // одна сессия подсказок = один выбранный адрес
      if (!p) return null
      const place = p.toPlace()
      await place.fetchFields({ fields: ['formattedAddress', 'location'] })
      return place.location ? { address: place.formattedAddress ?? s.text, lat: place.location.lat(), lng: place.location.lng() } : null
    },
    mapImage: () => null,
    async drawMap(el, p) {
      const [m, mk] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')])
      const center = { lat: p.lat, lng: p.lng }
      const map = new m.Map(el, { center, zoom: 16, disableDefaultUI: true, clickableIcons: false })
      new mk.Marker({ position: center, map })
    },
  }
}
