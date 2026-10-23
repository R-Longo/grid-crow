import type { StitchMatrix } from "../convert/types";
import { STITCHES_PER_INCH } from "../../config/gauge";

/**
 * A ROUGH estimate of the yarn each color needs, worked out from the chart and the gauge. It is a planning aid for deciding
 * how much to buy, never a measurement: real use depends on the yarn, the hook, tension and how the carried yarns are handled.
 *
 * How it works
 *  1. Yarn per stitch. A single crochet stitch uses a few times its own width in yarn. We take that as 8 to 12 times the
 *     stitch width (a snug-to-loose range). At 4 stitches per inch the width is 0.25 in, so 2.0 to 3.0 inches of yarn per stitch.
 *     This is a rule of thumb scaled from published swatch-weighing examples (about 3.9 in per double crochet at 3.3 stitches
 *     per inch), not a measured value for single crochet, which is why the answer is a range.
 *  2. Carried yarn. In tapestry crochet, colors not in use are carried inside the stitches. For each row, a color that appears
 *     is carried across the stitches between its first and last use in that row, adding about one stitch width per carried stitch.
 *  3. Extra. Tails, joins and swatching: 15% on top.
 */
export const WIDTH_FACTOR_LOW = 8;
export const WIDTH_FACTOR_HIGH = 12;
export const EXTRA = 0.15;

export interface ColorYarn {
  slot: number;
  hex: string;
  stitches: number;
  /** Yards, rounded up to a whole yard. */
  lowYards: number;
  highYards: number;
}

export interface YarnEstimate {
  colors: ColorYarn[];
  lowYards: number;
  highYards: number;
  inchesPerStitchLow: number;
  inchesPerStitchHigh: number;
}

const INCHES_PER_YARD = 36;

/** Stitches of each color, and the stitches each color is carried across (hidden inside stitches of other colors). */
export function countStitchesAndCarry(m: StitchMatrix): { stitches: number[]; carried: number[] } {
  const stitches = new Array<number>(m.palette.length).fill(0);
  const carried = new Array<number>(m.palette.length).fill(0);
  for (const row of m.cells) {
    const first = new Array<number>(m.palette.length).fill(-1);
    const last = new Array<number>(m.palette.length).fill(-1);
    const inRow = new Array<number>(m.palette.length).fill(0);
    row.forEach((c, i) => {
      stitches[c]++;
      inRow[c]++;
      if (first[c] < 0) first[c] = i;
      last[c] = i;
    });
    for (let c = 0; c < m.palette.length; c++) if (inRow[c] > 0) carried[c] += last[c] - first[c] + 1 - inRow[c];
  }
  return { stitches, carried };
}

export function estimateYarn(m: StitchMatrix): YarnEstimate {
  const width = 1 / STITCHES_PER_INCH; // inches
  const { stitches, carried } = countStitchesAndCarry(m);
  const yards = (n: number, carry: number, factor: number) =>
    Math.ceil(((n * width * factor + carry * width) * (1 + EXTRA)) / INCHES_PER_YARD);
  const colors: ColorYarn[] = m.palette
    .map((p, slot) => ({
      slot,
      hex: p.hex,
      stitches: stitches[slot],
      lowYards: yards(stitches[slot], carried[slot], WIDTH_FACTOR_LOW),
      highYards: yards(stitches[slot], carried[slot], WIDTH_FACTOR_HIGH),
    }))
    .filter((c) => c.stitches > 0)
    .sort((a, b) => b.stitches - a.stitches);
  return {
    colors,
    lowYards: colors.reduce((s, c) => s + c.lowYards, 0),
    highYards: colors.reduce((s, c) => s + c.highYards, 0),
    inchesPerStitchLow: width * WIDTH_FACTOR_LOW,
    inchesPerStitchHigh: width * WIDTH_FACTOR_HIGH,
  };
}

/** Skeins to buy for the high end of a color's range (never fewer than one). */
export function skeinsFor(highYards: number, yardsPerSkein: number): number {
  if (!(yardsPerSkein > 0)) return 0;
  return Math.max(1, Math.ceil(highYards / yardsPerSkein));
}
