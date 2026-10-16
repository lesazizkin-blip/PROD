import type { BoxStatus, Stage } from "../api/types";

export const STATUS_LABELS: Record<BoxStatus, string> = {
  packing: "Собирается",
  packed: "Собрана",
  loaded: "Погружена",
  delivered: "Доставлена",
  unpacked: "Распакована",
};

export const STATUS_ICONS: Record<BoxStatus, string> = {
  packing: "package-variant",
  packed: "package-variant-closed",
  loaded: "truck-fast-outline",
  delivered: "home-import-outline",
  unpacked: "check-circle-outline",
};

export const STAGE_LABELS: Record<Stage, string> = {
  before: "До переезда",
  moving_day: "День переезда",
  after: "После переезда",
};

export const STAGES: Stage[] = ["before", "moving_day", "after"];

/** Следующий статус вперёд (null, если коробка уже распакована). */
export function nextStatus(s: BoxStatus): BoxStatus | null {
  const order: BoxStatus[] = ["packing", "packed", "loaded", "delivered", "unpacked"];
  return order[order.indexOf(s) + 1] ?? null;
}

export function prevStatus(s: BoxStatus): BoxStatus | null {
  const order: BoxStatus[] = ["packing", "packed", "loaded", "delivered", "unpacked"];
  return order[order.indexOf(s) - 1] ?? null;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
