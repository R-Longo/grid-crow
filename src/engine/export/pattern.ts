import { ROWS_PER_INCH, STANDARD_GAUGE, STITCHES_PER_INCH } from "../../config/gauge";
import { aspectOf, describeGauge, gaugeOf, isDefaultGauge, sizeInches } from "../gauge";
import type { StitchGauge } from "../gauge";
import { lengthNumber, trimmed, yarnAmount, yarnShort, fromInches } from "../units";
import type { UnitSystem } from "../units";
import type { StitchMatrix } from "../convert/types";
import { stitchLabel } from "../editor/coords";
import { colorCounts } from "../editor/paint";
import { EXTRA, estimateYarn } from "../yarn/estimate";

/**
 * Everything an exported pattern says, worked out from the stitch matrix and nothing else. The PNG and PDF exports are
 * both drawn from this one description, so they cannot disagree about a count, a letter or a number.
 *
 * Numbering follows the chart conventions everywhere in GridCrow: stitches count from the RIGHT (stitch 1 is the right-hand edge, as odd rows are worked right to left) and
 * row 1 is the BOTTOM row, with row numbers rising upward. Inside the program a stitch is (col, row) with row 0 at the top.
 */

/** Width / height of one stitch: a stitch is 1/4 in across and 1/4.5 in high, so 1.125. Same as the chart on screen. */
export const STITCH_ASPECT = ROWS_PER_INCH / STITCHES_PER_INCH;

export interface PatternColor {
  /** Index into the chart's palette. */
  index: number;
  /** A, B, C ... given to the colors that are actually used, in palette order. */
  letter: string;
  /** Upper-case hex, "#RRGGBB". */
  hex: string;
  /** Exact number of stitches of this color in the chart as it is now. */
  count: number;
  /** Rough yarn estimate for this color, in whole yards (see engine/yarn/estimate.ts): the low and the high end. */
  lowYards: number;
  highYards: number;
}

export interface PatternModel {
  matrix: StitchMatrix;
  cols: number;
  rows: number;
  /** Colors with at least one stitch. A palette color that no stitch uses any more is left out. */
  colors: PatternColor[];
  /** Letter of each palette color, or null for one that is not used. */
  letterOf: Array<string | null>;
  /** Upper-case hex of each palette color. */
  hexOf: string[];
  /** Number of stitches (cols x rows). */
  total: number;
  widthInches: number;
  heightInches: number;
  /** The gauge this chart was made at, and the width / height of one stitch that follows from it. */
  gauge: StitchGauge;
  aspect: number;
  /** How lengths and yarn amounts are written: inches and yards, or centimeters and meters. Counts are never affected. */
  units: UnitSystem;
  /** Rough yarn estimate for the whole chart, in whole yards. */
  lowYards: number;
  highYards: number;
  /** Inches of yarn per stitch at the low and high end of the estimate. */
  inchesPerStitch: [number, number];
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A, B, C ... then AA, AB ... (a chart never has more than 10 colors; this just never fails). */
export function letterFor(n: number): string {
  if (n < LETTERS.length) return LETTERS[n];
  return letterFor(Math.floor(n / LETTERS.length) - 1) + LETTERS[n % LETTERS.length];
}

export function buildPatternModel(matrix: StitchMatrix, units: UnitSystem = "imperial"): PatternModel {
  const counts = colorCounts(matrix);
  const letterOf: Array<string | null> = [];
  const colors: PatternColor[] = [];
  const yarn = estimateYarn(matrix);
  const yarnOf = new Map(yarn.colors.map((c) => [c.slot, c]));
  matrix.palette.forEach((p, index) => {
    if (counts[index] > 0) {
      const letter = letterFor(colors.length);
      letterOf.push(letter);
      const y = yarnOf.get(index);
      colors.push({ index, letter, hex: p.hex.toUpperCase(), count: counts[index], lowYards: y?.lowYards ?? 0, highYards: y?.highYards ?? 0 });
    } else {
      letterOf.push(null);
    }
  });
  return {
    matrix,
    cols: matrix.cols,
    rows: matrix.rows,
    colors,
    letterOf,
    hexOf: matrix.palette.map((p) => p.hex.toUpperCase()),
    total: matrix.cols * matrix.rows,
    ...sizeInches(matrix.cols, matrix.rows, gaugeOf(matrix)),
    gauge: gaugeOf(matrix),
    aspect: aspectOf(gaugeOf(matrix)),
    units,
    lowYards: yarn.lowYards,
    highYards: yarn.highYards,
    inchesPerStitch: [yarn.inchesPerStitchLow, yarn.inchesPerStitchHigh],
  };
}

/** "40–60 yd" (a range, because this is an estimate), or "40 yd" when both ends agree. Meters when the units are metric. */
export function yardsText(low: number, high: number, units: UnitSystem = "imperial"): string {
  const a = yarnAmount(low, units), b = yarnAmount(high, units);
  const u = yarnShort(units);
  return a === b ? `${formatCount(a)} ${u}` : `${formatCount(a)}–${formatCount(b)} ${u}`;
}

/** The wording printed under every color key. Plain about what the numbers are and are not. */
export function yarnNote(m: PatternModel): string {
  const [a, b] = m.inchesPerStitch.map((n) => trimmed(fromInches(n, m.units)));
  return `Rough estimate, not a measurement: about ${a} to ${b} ${m.units === "metric" ? "centimeters" : "inches"} of yarn per stitch, plus carried yarn and ${Math.round(EXTRA * 100)}% extra. Yarn, hook and tension vary, so buy a bit more than the high number.`;
}

/** The number printed for column `col` (0-based, from the left; stitch 1 is the rightmost column) and for matrix row `row` (0 = top): row 1 is the bottom. */
export function stitchNumbers(col: number, row: number, rows: number, cols: number): { column: number; row: number } {
  const n = stitchLabel({ col, row }, rows, cols);
  return { column: n.stitch, row: n.row };
}

/** 24 -> "24", 3.5555 -> "3.6". */
export function formatInches(n: number): string {
  return String(Number(n.toFixed(1)));
}

/** "12,314" */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function sizeLine(m: PatternModel): string {
  return `${m.cols} stitches × ${m.rows} rows`;
}

export function finishedLine(m: PatternModel): string {
  return `Finished size about ${lengthNumber(m.widthInches, m.units)} × ${lengthNumber(m.heightInches, m.units)} ${m.units === "metric" ? "cm" : "inches"}`;
}

/** "Reference gauge: 16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook." */
export function gaugeLine(custom?: StitchGauge, units: UnitSystem = "imperial"): string {
  if (custom && !isDefaultGauge(custom)) return `Gauge: ${describeGauge(custom, units)}, measured from your own swatch. The chart is drawn to match it.`;
  const g = STANDARD_GAUGE;
  const yarn = g.yarnLabel.toLowerCase().replace(" weight", "-weight");
  return `Reference gauge: ${g.stitchesPerSwatch} stitches × ${g.rowsPerSwatch} rows per ${g.swatchInches} inches${units === "metric" ? " (about 10 cm)" : ""}, using ${yarn} yarn and a ${g.hookLabel} hook.`;
}

export const NUMBERING_NOTE = "Row 1 is the bottom row. Stitch 1 is at the right. Odd rows: work right to left. Even rows: turn, work left to right.";

/**
 * How to start the work. The foundation chain is one chain per stitch of the first row, plus one turning chain, so it
 * depends only on the chart's width. It is not a chart row, and a turning chain never counts as a stitch: every chart row
 * is exactly `cols` single crochet.
 */
export function foundationChain(cols: number): number {
  return cols + 1;
}

export interface StartStep {
  heading: string;
  text: string;
}

export function startingSteps(cols: number): StartStep[] {
  return [
    { heading: "FOUNDATION", text: `Chain ${foundationChain(cols)}.` },
    { heading: "ROW 1 — Right Side (RS)", text: `Starting in the second chain from the hook, work ${cols} single crochet stitches following Row 1 of the chart.` },
    { heading: "ROW 2 — Wrong Side (WS)", text: `Chain 1, turn. Work ${cols} single crochet stitches following Row 2 of the chart. The turning chain does not count as a stitch.` },
    { heading: "REMAINING ROWS", text: "Continue following the chart, chaining 1 and turning between rows." },
  ];
}

/** The same steps as one short paragraph, for the printed key where space is tight. */
export function startingParagraph(cols: number): string {
  return `FOUNDATION: Chain ${foundationChain(cols)}. ROW 1 (RS): Starting in the second chain from the hook, work ${cols} single crochet following Row 1 of the chart. ROW 2 (WS): Chain 1, turn (the turning chain is not a stitch). Work ${cols} single crochet following Row 2. Continue following the chart, chaining 1 and turning between rows.`;
}

export function patternFileName(m: PatternModel, extension: "png" | "pdf", suffix = ""): string {
  return `gridcrow-pattern-${m.cols}x${m.rows}${suffix ? "-" + suffix : ""}.${extension}`;
}

/** Which of the numbers 1..count get a label: all of them, or 1 and every 5th. */
export function labelNumbers(count: number, step: 1 | 5): number[] {
  const out: number[] = [];
  for (let n = 1; n <= count; n++) if (step === 1 || n === 1 || n % 5 === 0) out.push(n);
  return out;
}

/** Black or white, whichever reads better on a yarn color. */
export function inkOn(hex: string): "#17191b" | "#ffffff" {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140 ? "#17191b" : "#ffffff";
}
