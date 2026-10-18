import { CheckCheck, MapPinCheck, PackageCheck, PackageOpen, Truck } from 'lucide-react'
import type { BoxStatus } from '../api/types'
import { STATUS_LABELS } from './format'

const STATUS_ICONS = { packing: PackageOpen, packed: PackageCheck, loaded: Truck, delivered: MapPinCheck, unpacked: CheckCheck }

/** A small packing stamp, with both an icon and a readable status. */
export default function StatusBadge({ status }: { status: BoxStatus }) {
  const Icon = STATUS_ICONS[status]
  return <span className={`badge box-status st-${status}`}><Icon aria-hidden="true" />{STATUS_LABELS[status]}</span>
}
