/**
 * Splitting a chart into printable pages. The split always falls BETWEEN stitches, every stitch lands on exactly one
 * page, and the pieces are as even as possible (96 columns on pages that hold 27 become 4 pages of 24, not 27+27+27+15).
 */

export interface Tile {
  /** Page number in the PDF (the overview is page 1, so the first tile is page 2). */
  page: number;
  /** Position in the assembly, counted from the top-left: 0-based. */
  tc: number;
  tr: number;
  /** Columns c0 up to (not including) c1, from the left. Matrix rows r0 up to r1, from the TOP (row 1 of the chart is the last matrix row). */
  c0: number;
  c1: number;
  r0: number;
  r1: number;
  /** Page numbers of the neighbours that join this page, when there is one on that side. */
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface TilePlan {
  cols: number;
  rows: number;
  /** Tiles across and down. */
  across: number;
  down: number;
  colSizes: number[];
  rowSizes: number[];
  /** In reading order: left to right, then top to bottom. */
  tiles: Tile[];
  firstPage: number;
}

/** `total` split into the fewest parts of at most `max`, as equal as possible (the larger parts come first). */
export function evenSplit(total: number, max: number): number[] {
  const parts = Math.max(1, Math.ceil(total / max));
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

export function planTiles(cols: number, rows: number, maxCols: number, maxRows: number, firstPage = 2): TilePlan {
  const colSizes = evenSplit(cols, maxCols);
  const rowSizes = evenSplit(rows, maxRows);
  const across = colSizes.length;
  const down = rowSizes.length;
  const tiles: Tile[] = [];
  let r0 = 0;
  for (let tr = 0; tr < down; tr++) {
    let c0 = 0;
    for (let tc = 0; tc < across; tc++) {
      const page = firstPage + tr * across + tc;
      tiles.push({
        page,
        tc,
        tr,
        c0,
        c1: c0 + colSizes[tc],
        r0,
        r1: r0 + rowSizes[tr],
        left: tc > 0 ? page - 1 : undefined,
        right: tc < across - 1 ? page + 1 : undefined,
        top: tr > 0 ? page - across : undefined,
        bottom: tr < down - 1 ? page + across : undefined,
      });
      c0 += colSizes[tc];
    }
    r0 += rowSizes[tr];
  }
  return { cols, rows, across, down, colSizes, rowSizes, tiles, firstPage };
}
