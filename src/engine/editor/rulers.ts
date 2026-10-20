/**
 * Ruler labels for the chart editor. Pure math: no DOM.
 * Stitch numbers run along the top with stitch 1 at the RIGHT edge; row numbers run down the left with row 1 at the
 * BOTTOM. Positions use the same cell edges as the chart drawing and the stitch lookup (`cellEdge`), so a label is
 * always centred on the stitch it names, at any zoom or scroll position.
 */
import { cellEdge } from "./coords";

export interface RulerLabel {
  /** The number shown (1-based, as people count). */
  n: number;
  /** Centre of that stitch/row along the ruler, in viewport pixels (scroll already removed). */
  pos: number;
  /** A multiple of 10: drawn heavier. */
  major: boolean;
}

export interface RulerAxis {
  /** Number of stitches (top ruler) or rows (left ruler). */
  count: number;
  /** Size of one stitch/row in canvas pixels. */
  size: number;
  /** Scroll offset along the axis, and the visible length of the viewport. */
  scroll: number;
  view: number;
  /** Smallest comfortable gap between two printed labels, in pixels. */
  minGap: number;
}

/** Print every `step`-th number: the smallest of 1, 2, 5, 10, 20, 50 that leaves `minGap` between labels. */
export function labelStep(size: number, minGap: number): number {
  if (!(size > 0)) return 10;
  for (const s of [1, 2, 5, 10, 20, 50]) if (size * s >= minGap) return s;
  return 100;
}

/** Index (0-based, left to right / top to bottom) -> the number people see. */
export const stitchNumber = (index: number, count: number): number => count - index;

/**
 * Labels for the visible part of one axis. `numberOf(index)` gives the shown number: for stitches `count - index`
 * (stitch 1 at the right), for rows `count - index` (row 1 at the bottom). Both are the same rule, so one function.
 * Always includes number 1 so the origin is never missing; includes multiples of `step` otherwise.
 */
export function visibleLabels(a: RulerAxis): RulerLabel[] {
  const { count, size, scroll, view, minGap } = a;
  if (!(count > 0) || !(size > 0) || !(view > 0)) return [];
  const step = labelStep(size, minGap);
  const out: RulerLabel[] = [];
  // first/last indices whose cell overlaps [scroll, scroll + view]
  let first = Math.max(0, Math.floor(scroll / size) - 1);
  let last = Math.min(count - 1, Math.ceil((scroll + view) / size) + 1);
  for (let i = first; i <= last; i++) {
    const n = stitchNumber(i, count);
    if (!(n === 1 || n % step === 0)) continue;
    const a0 = cellEdge(i, size);
    const a1 = cellEdge(i + 1, size);
    const pos = (a0 + a1) / 2 - scroll;
    if (pos < -size || pos > view + size) continue;
    out.push({ n, pos, major: n % 10 === 0 });
  }
  return out;
}

/** Index range (0-based) of the highlighted row/column strip in viewport pixels along one axis. */
export function stripSpan(index: number, size: number, scroll: number): { start: number; length: number } {
  const a0 = cellEdge(index, size);
  const a1 = cellEdge(index + 1, size);
  return { start: a0 - scroll, length: a1 - a0 };
}

/** Which way a row is worked: odd rows (row 1 at the bottom) right to left, even rows left to right. */
export function rowDirection(rowNumber: number): "rtl" | "ltr" {
  return rowNumber % 2 === 1 ? "rtl" : "ltr";
}

export const DIRECTION_ARROW = { rtl: "←", ltr: "→" } as const;

/** Plain words for the way a row is worked, for the status line. */
export const directionLabel = (rowNumber: number): string =>
  rowDirection(rowNumber) === "rtl" ? "right to left" : "left to right";
