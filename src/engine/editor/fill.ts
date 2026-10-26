import type { StitchMatrix } from "../convert/types";
import type { Stitch } from "./coords";
import { isPaletteIndex } from "./paint";

/**
 * Flood fill: recolor the connected region of same-colored stitches that contains `start`. Stitches are connected
 * through their four edges (a stitch touching only at a corner is a different region). Iterative, so a fill of a
 * whole large chart cannot overflow the call stack. Returns a NEW matrix (unchanged rows are shared); the palette is
 * never touched and the color must already be in it.
 */
export function floodFill(
  m: StitchMatrix,
  start: Stitch,
  color: number,
): { matrix: StitchMatrix; changed: number[] } {
  if (!isPaletteIndex(m, color)) throw new RangeError(`palette color ${color} does not exist`);
  const { cols, rows } = m;
  if (start.col < 0 || start.col >= cols || start.row < 0 || start.row >= rows) return { matrix: m, changed: [] };
  const target = m.cells[start.row][start.col];
  if (target === color) return { matrix: m, changed: [] };

  const seen = new Uint8Array(cols * rows);
  const region: number[] = [];
  const stack: number[] = [start.row * cols + start.col];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    region.push(i);
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (c > 0 && !seen[i - 1] && m.cells[r][c - 1] === target) (seen[i - 1] = 1), stack.push(i - 1);
    if (c < cols - 1 && !seen[i + 1] && m.cells[r][c + 1] === target) (seen[i + 1] = 1), stack.push(i + 1);
    if (r > 0 && !seen[i - cols] && m.cells[r - 1][c] === target) (seen[i - cols] = 1), stack.push(i - cols);
    if (r < rows - 1 && !seen[i + cols] && m.cells[r + 1][c] === target) (seen[i + cols] = 1), stack.push(i + cols);
  }

  const cells = m.cells.slice();
  const copied = new Uint8Array(rows);
  for (const i of region) {
    const r = (i / cols) | 0;
    if (!copied[r]) {
      cells[r] = cells[r].slice();
      copied[r] = 1;
    }
    cells[r][i - r * cols] = color;
  }
  return { matrix: { ...m, cells }, changed: region };
}
