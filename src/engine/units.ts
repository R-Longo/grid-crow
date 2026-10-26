import type { StitchGauge } from "./gauge";

/**
 * Which measures GridCrow shows: inches and yards, or centimeters and meters. This is only how things are SHOWN and typed.
 * Charts, gauges and saved projects always keep inches inside, so switching units never changes a chart.
 */
export type UnitSystem = "imperial" | "metric";

export const CM_PER_INCH = 2.54;
export const METERS_PER_YARD = 0.9144;

/** Countries that still measure in inches: the US, Liberia and Myanmar. Everyone else gets centimeters first (they can switch). */
export function defaultUnits(language?: string): UnitSystem {
  if (!language) return "imperial";
  const l = language.toLowerCase().split(/[@.]/)[0].replace("_", "-");
  return l === "en-us" || l === "en" || l.endsWith("-us") || l.endsWith("-lr") || l.endsWith("-mm") ? "imperial" : "metric";
}

const KEY = "gridcrow-units";
export function loadUnits(): UnitSystem {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "imperial" || v === "metric") return v;
  } catch {
    /* no storage: use the language */
  }
  return defaultUnits(typeof navigator !== "undefined" ? navigator.language : undefined);
}
export function saveUnits(u: UnitSystem): void {
  try {
    window.localStorage.setItem(KEY, u);
  } catch {
    /* the choice just is not remembered */
  }
}

export const lengthShort = (u: UnitSystem) => (u === "metric" ? "cm" : "in");
export const lengthLong = (u: UnitSystem) => (u === "metric" ? "centimeters" : "inches");
export const yarnShort = (u: UnitSystem) => (u === "metric" ? "m" : "yd");
export const yarnLong = (u: UnitSystem) => (u === "metric" ? "Meters" : "Yards");

/** A length in inches, in the shown unit (not rounded). */
export const fromInches = (inches: number, u: UnitSystem) => (u === "metric" ? inches * CM_PER_INCH : inches);
/** A typed length in the shown unit, in inches. */
export const toInches = (value: number, u: UnitSystem) => (u === "metric" ? value / CM_PER_INCH : value);

/** 12 -> "12", 30.48 -> "30.5", 3.0000001 -> "3". */
export function trimmed(n: number, digits = 1): string {
  return String(Number(n.toFixed(digits)));
}

/** A length in inches written in the shown unit: "12" or "30.5". Centimeters of 10 or more are whole numbers. */
export function lengthNumber(inches: number, u: UnitSystem): string {
  const v = fromInches(inches, u);
  return u === "metric" && v >= 10 ? String(Math.round(v)) : trimmed(v);
}

/** "12 × 16 in" or "30 × 41 cm". */
export function sizeText(widthInches: number, heightInches: number, u: UnitSystem): string {
  return `${lengthNumber(widthInches, u)} × ${lengthNumber(heightInches, u)} ${lengthShort(u)}`;
}

/** Yards in the shown unit, rounded up to a whole number (a little extra yarn is never a problem). */
export function yarnAmount(yards: number, u: UnitSystem): number {
  return u === "metric" ? Math.max(0, Math.ceil(yards * METERS_PER_YARD - 1e-9)) : yards;
}

/** Stitches and rows per inch written the way people give gauge: per inch, or per 10 cm. */
export function gaugePer(g: StitchGauge, u: UnitSystem): { stitches: number; rows: number; per: string } {
  return u === "metric"
    ? { stitches: (g.stitchesPerInch * 10) / CM_PER_INCH, rows: (g.rowsPerInch * 10) / CM_PER_INCH, per: "10 cm" }
    : { stitches: g.stitchesPerInch, rows: g.rowsPerInch, per: "inch" };
}
