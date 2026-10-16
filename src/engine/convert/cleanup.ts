import { deltaE } from "./color";

/**
 * Crochet-aware cleanup. A single stray stitch of a slightly different color is noise that
 * makes a chart tedious to work; a single gold stitch in a dark head is an eye. So tiny regions
 * are merged into their surroundings ONLY when their color is close to what surrounds them.
 * Regions whose color contrasts strongly with the surroundings are kept.
 */
export const CLEANUP_DEFAULTS = {
  /** Regions up to this many stitches are candidates for merging. */
  maxSmallRegion: 2,
  /** A 1-stitch region with at least this Lab contrast against its surroundings is protected. */
  protectContrast1: 40,
  /** A 2-stitch region needs at least this contrast to be protected. */
  protectContrast2: 28,
  passes: 2,
  /** Whether same-colored stitches touching only at corners count as one region. Off: in crochet two
   *  stitches that only meet at a corner are still separate color changes, and counting them as joined
   *  would protect speckle in photographs. High-contrast lines are protected by the contrast rule anyway. */
  diagonalConnects: false,
};

export type CleanupOptions = typeof CLEANUP_DEFAULTS;

interface Region {
  color: number;
  cells: number[]; // r * cols + c
}

function findRegions(cells: number[][], rows: number, cols: number, diagonal: boolean): Region[] {
  const seen = new Uint8Array(rows * cols);
  const regions: Region[] = [];
  const stack: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const start = r * cols + c;
      if (seen[start]) continue;
      const color = cells[r][c];
      const region: Region = { color, cells: [] };
      seen[start] = 1;
      stack.push(start);
      while (stack.length) {
        const cur = stack.pop() as number;
        region.cells.push(cur);
        const cr = (cur / cols) | 0;
        const cc = cur - cr * cols;
        const nb = [
          cr > 0 ? cur - cols : -1,
          cr < rows - 1 ? cur + cols : -1,
          cc > 0 ? cur - 1 : -1,
          cc < cols - 1 ? cur + 1 : -1,
        ];
        if (diagonal) {
          nb.push(
            cr > 0 && cc > 0 ? cur - cols - 1 : -1,
            cr > 0 && cc < cols - 1 ? cur - cols + 1 : -1,
            cr < rows - 1 && cc > 0 ? cur + cols - 1 : -1,
            cr < rows - 1 && cc < cols - 1 ? cur + cols + 1 : -1,
          );
        }
        for (const n of nb) {
          if (n < 0 || seen[n]) continue;
          const nr = (n / cols) | 0;
          if (cells[nr][n - nr * cols] === color) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

export function cleanupMatrix(
  cells: number[][],
  palette: Float64Array,
  k: number,
  opts: CleanupOptions = CLEANUP_DEFAULTS,
): number[][] {
  const rows = cells.length;
  const cols = rows ? cells[0].length : 0;
  let cur = cells.map((r) => r.slice());
  for (let pass = 0; pass < opts.passes; pass++) {
    const regions = findRegions(cur, rows, cols, opts.diagonalConnects);
    const next = cur.map((r) => r.slice());
    let changed = false;
    for (const reg of regions) {
      if (reg.cells.length > opts.maxSmallRegion) continue;
      const inRegion = new Set(reg.cells);
      const counts = new Float64Array(k);
      for (const cell of reg.cells) {
        const r = (cell / cols) | 0;
        const c = cell - r * cols;
        const nbs: Array<[number, number]> = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        for (const [nr, nc] of nbs) {
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (inRegion.has(nr * cols + nc)) continue;
          counts[cur[nr][nc]]++;
        }
      }
      // Surrounding color: most common neighbour; ties go to the one closest in color.
      let target = -1;
      for (let p = 0; p < k; p++) {
        if (counts[p] === 0) continue;
        if (
          target < 0 ||
          counts[p] > counts[target] ||
          (counts[p] === counts[target] &&
            deltaE(palette, p * 3, palette, reg.color * 3) < deltaE(palette, target * 3, palette, reg.color * 3))
        ) {
          target = p;
        }
      }
      if (target < 0) continue;
      const contrast = deltaE(palette, reg.color * 3, palette, target * 3);
      const protect = reg.cells.length === 1 ? opts.protectContrast1 : opts.protectContrast2;
      if (contrast >= protect) continue; // detail worth keeping, such as an eye
      for (const cell of reg.cells) {
        const r = (cell / cols) | 0;
        next[r][cell - r * cols] = target;
      }
      changed = true;
    }
    cur = next;
    if (!changed) break;
  }
  return cur;
}
