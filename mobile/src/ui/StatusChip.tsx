import { Chip, Icon } from "react-native-paper";
import type { BoxStatus } from "../api/types";
import { STATUS_COLORS } from "../theme";
import { STATUS_ICONS, STATUS_LABELS } from "./format";

/** Цветная метка статуса коробки. */
export function StatusChip({ status }: { status: BoxStatus }) {
  const color = STATUS_COLORS[status];
  return (
    <Chip
      compact
      icon={({ size }) => <Icon source={STATUS_ICONS[status]} size={size} color={color} />}
      style={{ backgroundColor: `${color}22` }}
      textStyle={{ color }}
    >
      {STATUS_LABELS[status]}
    </Chip>
  );
}
