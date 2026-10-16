import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";
import type { BoxStatus } from "./api/types";

// Один фирменный цвет (бирюзовый) и тёплый акцент. Всё остальное берётся из Material 3.
const BRAND = "#0F766E";

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: BRAND,
    onPrimary: "#FFFFFF",
    primaryContainer: "#CDEBE6",
    onPrimaryContainer: "#00201C",
    secondary: "#B45309",
    secondaryContainer: "#FDE7C8",
    background: "#F4F7F6",
    surface: "#FFFFFF",
    surfaceVariant: "#E4ECEA",
    elevation: { ...MD3LightTheme.colors.elevation, level1: "#FFFFFF", level2: "#FFFFFF" },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 4,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#5FD3C4",
    onPrimary: "#00201C",
    primaryContainer: "#0B3D38",
    onPrimaryContainer: "#CDEBE6",
    background: "#0E1514",
    surface: "#161E1D",
  },
};

/** Цвет каждого статуса коробки: один и тот же на всех экранах. */
export const STATUS_COLORS: Record<BoxStatus, string> = {
  packing: "#64748B",
  packed: "#B45309",
  loaded: "#EA580C",
  delivered: "#2563EB",
  unpacked: "#15803D",
};

export const SPACING = 16;
