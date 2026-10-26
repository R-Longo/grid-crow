import { ROWS_PER_INCH, STITCHES_PER_INCH } from "../config/gauge";
import type { StitchMatrix } from "./convert/types";
import { gaugePer } from "./units";
import type { UnitSystem } from "./units";

/**
 * A crocheter's own gauge: how many stitches and rows fit in one inch of THEIR fabric.
 * Every chart carries one (the standard gauge unless the person set their own), so the shape of a stitch on screen,
 * the finished size, the yarn estimate and the printed patterns all agree with the fabric they will really make.
 */
export interface StitchGauge {
  stitchesPerInch: number;
  rowsPerInch: number;
}

export const DEFAULT_GAUGE: StitchGauge = { stitchesPerInch: STITCHES_PER_INCH, rowsPerInch: ROWS_PER_INCH };

/** Sensible limits: below or above these a number is almost certainly a typing mistake. */
export const GAUGE_LIMITS = { stitchesPerInch: { min: 1, max: 12 }, rowsPerInch: { min: 1, max: 14 } } as const;
/** Biggest chart the editor and exports are built for, in stitches or rows. */
export const MAX_CHART_SIDE = 200;

export function validGauge(g: unknown): g is StitchGauge {
  const x = g as StitchGauge;
  return (
    !!x &&
    Number.isFinite(x.stitchesPerInch) &&
    Number.isFinite(x.rowsPerInch) &&
    x.stitchesPerInch >= GAUGE_LIMITS.stitchesPerInch.min &&
    x.stitchesPerInch <= GAUGE_LIMITS.stitchesPerInch.max &&
    x.rowsPerInch >= GAUGE_LIMITS.rowsPerInch.min &&
    x.rowsPerInch <= GAUGE_LIMITS.rowsPerInch.max
  );
}

/** The gauge a chart was made with (the standard gauge for charts made before custom gauge existed). */
export function gaugeOf(m: { gauge?: StitchGauge }): StitchGauge {
  return m.gauge && validGauge(m.gauge) ? m.gauge : DEFAULT_GAUGE;
}

/** Width / height of one stitch: 1/stitchesPerInch across, 1/rowsPerInch high. The standard gauge gives 1.125. */
export function aspectOf(g: StitchGauge): number {
  return g.rowsPerInch / g.stitchesPerInch;
}

export function isDefaultGauge(g: StitchGauge): boolean {
  return Math.abs(g.stitchesPerInch - DEFAULT_GAUGE.stitchesPerInch) < 1e-9 && Math.abs(g.rowsPerInch - DEFAULT_GAUGE.rowsPerInch) < 1e-9;
}

/** Gauge from a measured swatch: stitches counted across `widthInches`, rows counted up `heightInches`. Null if any number is unusable. */
export function gaugeFromSwatch(stitches: number, widthInches: number, rows: number, heightInches: number): StitchGauge | null {
  if (![stitches, widthInches, rows, heightInches].every((n) => Number.isFinite(n) && n > 0)) return null;
  const g = { stitchesPerInch: stitches / widthInches, rowsPerInch: rows / heightInches };
  return validGauge(g) ? g : null;
}

/** Stitches and rows for a finished size in inches at a gauge. */
export function stitchesForSize(widthInches: number, heightInches: number, g: StitchGauge): { cols: number; rows: number } {
  return { cols: Math.max(1, Math.round(widthInches * g.stitchesPerInch)), rows: Math.max(1, Math.round(heightInches * g.rowsPerInch)) };
}

/** Finished size in inches of a chart. */
export function sizeInches(cols: number, rows: number, g: StitchGauge): { widthInches: number; heightInches: number } {
  return { widthInches: cols / g.stitchesPerInch, heightInches: rows / g.rowsPerInch };
}

/** "5 stitches and 6 rows per inch" with trailing zeros trimmed. */
export function describeGauge(g: StitchGauge, units: UnitSystem = "imperial"): string {
  const n = (v: number) => String(Number(v.toFixed(2)));
  const p = gaugePer(g, units);
  return `${n(p.stitches)} stitches and ${n(p.rows)} rows per ${p.per}`;
}

/** Does a chart keep the gauge it carries when copied? Helper for code that rebuilds a matrix. */
export function withGaugeOf(src: StitchMatrix, m: StitchMatrix): StitchMatrix {
  return src.gauge ? { ...m, gauge: src.gauge } : m;
}
