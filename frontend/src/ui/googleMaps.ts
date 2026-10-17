// Google Maps JavaScript API грузится только по кнопке пользователя: до этого адрес никуда не уходит.
// Типы минимальные - только то, чем пользуемся (подсказки Places API New и карта с меткой).

export interface LatLng { lat(): number; lng(): number }
export interface LatLngLiteral { lat: number; lng: number }

export interface PlacePrediction {
  text: { toString(): string }
  toPlace(): { fetchFields(o: { fields: string[] }): Promise<unknown>; formattedAddress?: string; location?: LatLng }
}

interface PlacesLibrary {
  AutocompleteSessionToken: new () => unknown
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(r: { input: string; language: string; region: string; sessionToken: unknown }): Promise<{ suggestions: { placePrediction: PlacePrediction | null }[] }>
  }
}

interface MapsLibrary {
  Map: new (el: HTMLElement, o: { center: LatLngLiteral; zoom: number; disableDefaultUI: boolean; clickableIcons: boolean }) => unknown
}

interface MarkerLibrary {
  Marker: new (o: { position: LatLngLiteral; map: unknown }) => unknown
}

export interface GoogleMaps {
  importLibrary(name: 'places'): Promise<PlacesLibrary>
  importLibrary(name: 'maps'): Promise<MapsLibrary>
  importLibrary(name: 'marker'): Promise<MarkerLibrary>
}

declare global {
  interface Window {
    google?: { maps?: GoogleMaps }
    __movermateMapsReady?: () => void
  }
}

let loading: Promise<GoogleMaps> | null = null

/** Подключает скрипт Google Maps один раз на страницу. */
export function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps)
  loading ??= new Promise<GoogleMaps>((resolve, reject) => {
    window.__movermateMapsReady = () => (window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps не загрузился')))
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=ru&region=RU&loading=async&callback=__movermateMapsReady`
    script.async = true
    script.onerror = () => {
      loading = null
      reject(new Error('Не удалось загрузить Google Maps: проверьте интернет или ключ'))
    }
    document.head.appendChild(script)
  })
  return loading
}
