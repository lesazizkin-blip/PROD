import { Check, Home, Truck } from 'lucide-react'
import type { BoxStatus } from '../../api/types'
import { BOX_LOCATIONS, LOCATION_LABELS, locationFor } from './boxLocations'

export default function BoxRoute({ status }: { status: BoxStatus }) {
  const current = BOX_LOCATIONS.indexOf(locationFor(status))
  return <ol className="box-route" aria-label="Путь коробки">
    {BOX_LOCATIONS.map((place, index) => {
      const Icon = index < current ? Check : place === 'truck' ? Truck : Home
      return <li key={place} aria-current={index === current ? 'step' : undefined} className={index <= current ? 'is-reached' : ''}><Icon className="icon-sm" aria-hidden /><span>{LOCATION_LABELS[place]}</span>{index === current ? <span className="sr-only"> — сейчас</span> : null}</li>
    })}
  </ol>
}
