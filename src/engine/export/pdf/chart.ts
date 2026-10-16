import type { PatternModel } from "../pattern";
import { inkOn } from "../pattern";
import type { Op } from "./ops";

export const INK = "#17191b";
export const MUTED = "#3d3a37";
const GRID = "#7f7f7f";
const WHITE = "#ffffff";

/** A rectangle of the chart to draw, and how to draw it. Columns are counted from the left (0-based), rows from the TOP of the matrix. */
export interface Region {
  /** Top-left corner of the stitches on the page, in points. */
  x0: number;
  y0: number;
  cellW: number;
  cellH: number;
  /** Stitches drawn: columns c0 up to (not including) c1, matrix rows r0 up to r1. */
  c0: number;
  c1: number;
  r0: number;
  r1: number;
  letters: boolean;
  letterSize: number;
  numberSize: number;
  /** Label every n-th column / row number (1 = all; the first number is always labelled). */
  stepX: number;
  stepY: number;
  /** Distance from the stitch edge to the numbers. */
  gutter: number;
  /** Edges that touch another page: they get the heavy alignment line and registration ticks. */
  joins: { left: boolean; right: boolean; top: boolean; bottom: boolean };
  thinWidth: number;
  heavyWidth: number;
  /** Width of the alignment line on a joining edge. */
  joinWidth: number;
}

/** Which of the lines between stitches get a registration tick on a joining edge: every 5th stitch line, counted globally. */
export function tickLines(lo: number, hi: number, globalIndexOf: (i: number) => number): number[] {
  const inside: number[] = [];
  for (let i = lo + 1; i < hi; i++) inside.push(i);
  const fives = inside.filter((i) => globalIndexOf(i) % 5 === 0);
  return fives.length >= 1 ? fives : inside;
}

const TICK_OUT = 9;
const TICK_IN = 7;

/** Draw the stitches of a region, with grid, heavy lines, border, alignment marks and numbers. */
export function drawRegion(ops: Op[], model: PatternModel, g: Region): void {
  const { matrix, hexOf, letterOf, cols, rows } = model;
  const nCols = g.c1 - g.c0;
  const nRows = g.r1 - g.r0;
  const w = nCols * g.cellW;
  const h = nRows * g.cellH;
  const xAt = (c: number) => g.x0 + (c - g.c0) * g.cellW;
  const yAt = (r: number) => g.y0 + (r - g.r0) * g.cellH;

  // Stitches: one rectangle per run of the same color along a row. Page edges fall between stitches, so a run never leaves the region.
  for (let r = g.r0; r < g.r1; r++) {
    const row = matrix.cells[r];
    let start = g.c0;
    for (let c = g.c0 + 1; c <= g.c1; c++) {
      if (c === g.c1 || row[c] !== row[start]) {
        ops.push({ k: "rect", x: xAt(start), y: yAt(r), w: (c - start) * g.cellW, h: g.cellH, fill: hexOf[row[start]], tag: "stitch" });
        start = c;
      }
    }
  }

  // A letter in each stitch (colors can then be told apart on a black-and-white print).
  if (g.letters) {
    for (let r = g.r0; r < g.r1; r++) {
      for (let c = g.c0; c < g.c1; c++) {
        const idx = matrix.cells[r][c];
        ops.push({
          k: "text",
          x: xAt(c) + g.cellW / 2,
          y: yAt(r) + g.cellH / 2 + g.letterSize * 0.36,
          s: letterOf[idx] as string,
          size: g.letterSize,
          bold: true,
          color: inkOn(hexOf[idx]),
          align: "center",
          tag: "letter",
        });
      }
    }
  }

  // Thin grid between stitches.
  if (g.thinWidth > 0) {
    for (let c = g.c0 + 1; c < g.c1; c++) if (c % 10 !== 0) ops.push({ k: "line", x1: xAt(c), y1: g.y0, x2: xAt(c), y2: g.y0 + h, w: g.thinWidth, color: GRID, tag: "grid" });
    for (let r = g.r0 + 1; r < g.r1; r++) if ((rows - r) % 10 !== 0) ops.push({ k: "line", x1: g.x0, y1: yAt(r), x2: g.x0 + w, y2: yAt(r), w: g.thinWidth, color: GRID, tag: "grid" });
  }

  // Heavier line after every 10th stitch (from the left) and 10th row (from the bottom): a white edge under a dark core, so it shows on any yarn.
  const halo = g.heavyWidth + Math.min(1.6, g.cellH * 0.18);
  for (let c = g.c0 + 1; c < g.c1; c++) {
    if (c % 10 !== 0) continue;
    ops.push({ k: "line", x1: xAt(c), y1: g.y0, x2: xAt(c), y2: g.y0 + h, w: halo, color: WHITE, tag: "heavy-halo" });
    ops.push({ k: "line", x1: xAt(c), y1: g.y0, x2: xAt(c), y2: g.y0 + h, w: g.heavyWidth, color: INK, tag: "heavy" });
  }
  for (let r = g.r0 + 1; r < g.r1; r++) {
    if ((rows - r) % 10 !== 0) continue;
    ops.push({ k: "line", x1: g.x0, y1: yAt(r), x2: g.x0 + w, y2: yAt(r), w: halo, color: WHITE, tag: "heavy-halo" });
    ops.push({ k: "line", x1: g.x0, y1: yAt(r), x2: g.x0 + w, y2: yAt(r), w: g.heavyWidth, color: INK, tag: "heavy" });
  }

  // Edges. A joining edge gets the bold alignment line (white edge under a dark core); the others a plain border.
  const bw = Math.max(0.9, g.heavyWidth);
  const edge = (x1: number, y1: number, x2: number, y2: number, join: boolean) => {
    if (join) ops.push({ k: "line", x1, y1, x2, y2, w: g.joinWidth + 2, color: WHITE, tag: "join-halo" });
    ops.push({ k: "line", x1, y1, x2, y2, w: join ? g.joinWidth : bw, color: INK, tag: join ? "join" : "border" });
  };
  const L = g.x0;
  const R = g.x0 + w;
  const T = g.y0;
  const B = g.y0 + h;
  edge(L, T, L, B, g.joins.left);
  edge(R, T, R, B, g.joins.right);
  edge(L, T, R, T, g.joins.top);
  edge(L, B, R, B, g.joins.bottom);
  // Square the corners.
  for (const [x, y] of [[L, T], [R, T], [L, B], [R, B]]) ops.push({ k: "rect", x: x - bw / 2, y: y - bw / 2, w: bw, h: bw, fill: INK, tag: "corner" });

  // Registration ticks across each joining edge, at the same global stitch lines on both pages that meet there.
  const tickW = 1.4;
  if (g.joins.left || g.joins.right) {
    for (const r of tickLines(g.r0, g.r1, (i) => rows - i)) {
      const y = yAt(r);
      if (g.joins.left) ops.push({ k: "line", x1: L - TICK_OUT, y1: y, x2: L + TICK_IN, y2: y, w: tickW, color: INK, tag: "tick-left" });
      if (g.joins.right) ops.push({ k: "line", x1: R - TICK_IN, y1: y, x2: R + TICK_OUT, y2: y, w: tickW, color: INK, tag: "tick-right" });
    }
  }
  if (g.joins.top || g.joins.bottom) {
    for (const c of tickLines(g.c0, g.c1, (i) => i)) {
      const x = xAt(c);
      if (g.joins.top) ops.push({ k: "line", x1: x, y1: T - TICK_OUT, x2: x, y2: T + TICK_IN, w: tickW, color: INK, tag: "tick-top" });
      if (g.joins.bottom) ops.push({ k: "line", x1: x, y1: B - TICK_IN, x2: x, y2: B + TICK_OUT, w: tickW, color: INK, tag: "tick-bottom" });
    }
  }

  // Numbers. Columns run left to right (1 at the left of the whole chart); row 1 is the BOTTOM row of the whole chart.
  const ns = g.numberSize;
  for (let c = g.c0; c < g.c1; c++) {
    const n = c + 1;
    if (!(n === 1 || n % g.stepX === 0)) continue;
    const x = xAt(c) + g.cellW / 2;
    const bold = n % 10 === 0;
    ops.push({ k: "text", x, y: T - g.gutter, s: String(n), size: ns, bold, color: MUTED, align: "center", tag: "label-col-top" });
    ops.push({ k: "text", x, y: B + g.gutter + ns * 0.72, s: String(n), size: ns, bold, color: MUTED, align: "center", tag: "label-col-bottom" });
  }
  for (let r = g.r0; r < g.r1; r++) {
    const n = rows - r;
    if (!(n === 1 || n % g.stepY === 0)) continue;
    const y = yAt(r) + g.cellH / 2 + ns * 0.36;
    const bold = n % 10 === 0;
    ops.push({ k: "text", x: L - g.gutter, y, s: String(n), size: ns, bold, color: MUTED, align: "center", tag: "label-row-left" });
    ops.push({ k: "text", x: R + g.gutter, y, s: String(n), size: ns, bold, color: MUTED, align: "center", tag: "label-row-right" });
  }
  void cols;
}
