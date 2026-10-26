import { DEFAULT_GAUGE, GAUGE_LIMITS, MAX_CHART_SIDE, gaugeFromSwatch, sizeInches, stitchesForSize } from "./gauge";
import type { StitchGauge } from "./gauge";
import type { CustomSize } from "../types";
import { CM_PER_INCH, lengthLong, toInches, fromInches } from "./units";
import type { UnitSystem } from "./units";

/** What the person typed on the Manual Mode page, exactly as typed. */
export interface ManualRaw {
  /** Swatch: stitches counted across, and the inches they measured. */
  sw: string;
  swIn: string;
  /** Swatch: rows counted up, and the inches they measured. */
  sh: string;
  shIn: string;
  /** Finished size wanted, in inches. */
  w: string;
  h: string;
}

export const EMPTY_MANUAL: ManualRaw = { sw: "", swIn: "", sh: "", shIn: "", w: "", h: "" };

/** The standard gauge written as a swatch (16 stitches and 18 rows over 4 inches), for the "use the standard gauge" button. */
export const STANDARD_SWATCH = { sw: "16", swIn: "4", sh: "18", shIn: "4" } as const;
/** The same swatch, written in the shown unit (4 inches is 10.16 cm). */
export function standardSwatch(units: UnitSystem): Pick<ManualRaw, "sw" | "swIn" | "sh" | "shIn"> {
  if (units === "imperial") return { ...STANDARD_SWATCH };
  const cm = String(Number((4 * CM_PER_INCH).toFixed(2)));
  return { sw: "16", swIn: cm, sh: "18", shIn: cm };
}

/** Convert what was typed from one unit to another (only the lengths), so switching units keeps the same measurements. */
export function convertRaw(raw: ManualRaw, from: UnitSystem, to: UnitSystem): ManualRaw {
  if (from === to) return raw;
  const f = (s: string) => {
    const n = typed(s);
    return n === null ? s : String(Number(fromInches(toInches(n, from), to).toFixed(2)));
  };
  return { ...raw, swIn: f(raw.swIn), shIn: f(raw.shIn), w: f(raw.w), h: f(raw.h) };
}

/** The most inches either side of a finished piece can be before it is certainly a typing mistake. */
export const MAX_INCHES = 120;

/** A typed number: digits with one decimal point (a comma is accepted for a point). Null when empty or not a number. */
export function typed(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface ManualResult {
  gauge: StitchGauge | null;
  /** Why the gauge cannot be worked out yet, in plain words (empty while nothing has been typed). */
  gaugeProblem: string;
  cols: number | null;
  rows: number | null;
  /** The finished size the stitches actually make (a whole number of stitches rarely hits the inches exactly). */
  actualWidth: number | null;
  actualHeight: number | null;
  sizeProblem: string;
  /** Ready to build: a good gauge, a good size, and a chart no bigger than GridCrow supports. */
  custom: CustomSize | null;
}

export function parseManual(raw: ManualRaw, units: UnitSystem = "imperial"): ManualResult {
  const inch = (s: string) => {
    const n = typed(s);
    return n === null ? null : toInches(n, units);
  };
  const sw = typed(raw.sw), swIn = inch(raw.swIn), sh = typed(raw.sh), shIn = inch(raw.shIn);
  let gauge: StitchGauge | null = null;
  let gaugeProblem = "";
  const anyGauge = [raw.sw, raw.swIn, raw.sh, raw.shIn].some((s) => s.trim() !== "");
  if (anyGauge) {
    if (sw === null || swIn === null || sh === null || shIn === null) gaugeProblem = "Fill in all four swatch numbers to see your gauge.";
    else {
      gauge = gaugeFromSwatch(sw, swIn, sh, shIn);
      if (!gauge) {
        const { stitchesPerInch: s, rowsPerInch: r } = GAUGE_LIMITS;
        gaugeProblem = `Those numbers don't look right. A swatch has between ${s.min} and ${s.max} stitches and between ${r.min} and ${r.max} rows per inch. Check the counts and the measurements.`;
      }
    }
  }
  const w = inch(raw.w), h = inch(raw.h);
  let cols: number | null = null, rows: number | null = null, aw: number | null = null, ah: number | null = null;
  let sizeProblem = "";
  const anySize = raw.w.trim() !== "" || raw.h.trim() !== "";
  if (anySize && (w === null || h === null)) sizeProblem = `Type both a width and a height in ${lengthLong(units)}.`;
  else if (w !== null && h !== null) {
    if (w < 1 || h < 1 || w > MAX_INCHES || h > MAX_INCHES) sizeProblem = `Width and height need to be between ${Math.round(fromInches(1, units))} and ${Math.round(fromInches(MAX_INCHES, units))} ${lengthLong(units)}.`;
    else if (gauge) {
      const s = stitchesForSize(w, h, gauge);
      cols = s.cols;
      rows = s.rows;
      const a = sizeInches(cols, rows, gauge);
      aw = a.widthInches;
      ah = a.heightInches;
      if (cols > MAX_CHART_SIDE || rows > MAX_CHART_SIDE)
        sizeProblem = `That would be ${cols} stitches × ${rows} rows. GridCrow charts go up to ${MAX_CHART_SIDE} on a side, so make the piece smaller (or chart it in sections).`;
    }
  }
  const custom: CustomSize | null =
    gauge && w !== null && h !== null && cols !== null && rows !== null && !sizeProblem
      ? { widthInches: w, heightInches: h, stitchesPerInch: gauge.stitchesPerInch, rowsPerInch: gauge.rowsPerInch }
      : null;
  return { gauge, gaugeProblem, cols, rows, actualWidth: aw, actualHeight: ah, sizeProblem, custom };
}

/** Turn a saved custom size back into typed fields (swatch written as the gauge over 4 inches). */
export function rawFromCustom(c: CustomSize, units: UnitSystem = "imperial"): ManualRaw {
  const n = (v: number) => String(Number(v.toFixed(2)));
  const len = (inches: number) => n(fromInches(inches, units));
  return { sw: n(c.stitchesPerInch * 4), swIn: len(4), sh: n(c.rowsPerInch * 4), shIn: len(4), w: len(c.widthInches), h: len(c.heightInches) };
}

export { DEFAULT_GAUGE };
