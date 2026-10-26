import type { StitchMatrix } from "../convert/types";
import type { Stitch } from "./coords";

/**
 * Editing operations on a stitch matrix. They return a NEW matrix (unchanged rows are shared) and never touch
 * the palette: a stitch can only be set to a color the chart already has, so editing can never raise the number
 * of colors. Nothing here reads or converts the source picture.
 */

export function isPaletteIndex(m: StitchMatrix, color: number): boolean {
  return Number.isInteger(color) && color >= 0 && color < m.palette.length;
}

/** Set the given stitches to `color`. Returns the new matrix and how many stitches actually changed. */
export function paintStitches(
  m: StitchMatrix,
  stitches: Iterable<Stitch>,
  color: number,
): { matrix: StitchMatrix; changed: Stitch[] } {
  if (!isPaletteIndex(m, color)) throw new RangeError(`palette color ${color} does not exist`);
  const cells = m.cells.slice();
  const copied = new Set<number>();
  const changed: Stitch[] = [];
  for (const s of stitches) {
    if (s.col < 0 || s.col >= m.cols || s.row < 0 || s.row >= m.rows) continue;
    if (cells[s.row][s.col] === color) continue;
    if (!copied.has(s.row)) {
      cells[s.row] = cells[s.row].slice();
      copied.add(s.row);
    }
    cells[s.row][s.col] = color;
    changed.push(s);
  }
  if (changed.length === 0) return { matrix: m, changed };
  return { matrix: { ...m, cells }, changed };
}

/** Every stitch on the straight line from a to b, ends included (Bresenham), so a fast drag leaves no gaps. */
export function stitchesOnSegment(a: Stitch, b: Stitch): Stitch[] {
  const out: Stitch[] = [];
  let x = a.col;
  let y = a.row;
  const dx = Math.abs(b.col - a.col);
  const dy = -Math.abs(b.row - a.row);
  const sx = a.col < b.col ? 1 : -1;
  const sy = a.row < b.row ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ col: x, row: y });
    if (x === b.col && y === b.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/**
 * How many stitches differ between two matrices of the same size: a different palette index, or the same index whose
 * palette color has since been changed (a recolored yarn).
 */
export function countDifferences(a: StitchMatrix, b: StitchMatrix): number {
  if (a.cols !== b.cols || a.rows !== b.rows) throw new RangeError("charts differ in size");
  // Palette slots whose color differs between the two charts (none, unless a color was recolored).
  const recolored = new Set<number>();
  const shared = Math.min(a.palette.length, b.palette.length);
  for (let i = 0; i < shared; i++) if (a.palette[i].hex.toLowerCase() !== b.palette[i].hex.toLowerCase()) recolored.add(i);
  let n = 0;
  for (let r = 0; r < a.rows; r++) {
    if (a.cells[r] === b.cells[r] && recolored.size === 0) continue;
    const ra = a.cells[r];
    const rb = b.cells[r];
    for (let c = 0; c < a.cols; c++) if (ra[c] !== rb[c] || recolored.has(ra[c])) n++;
  }
  return n;
}

/** How many stitches use each palette color. */
export function colorCounts(m: StitchMatrix): number[] {
  const n = new Array<number>(m.palette.length).fill(0);
  for (const row of m.cells) for (const v of row) n[v]++;
  return n;
}
