import { cellEdge } from "../engine/editor/coords";
import type { ChartLayout, Stitch } from "../engine/editor/coords";
import type { StitchMatrix } from "../engine/convert/types";

/**
 * Canvas drawing for the stitch chart. Draws FROM the matrix and never writes to it. Cell edges use the same
 * rounding as `pointToStitch`, so what is drawn under a point is the stitch that point selects.
 */
function fillCell(ctx: CanvasRenderingContext2D, m: StitchMatrix, l: ChartLayout, col: number, row: number) {
  const x0 = cellEdge(col, l.cellW);
  const y0 = cellEdge(row, l.cellH);
  ctx.fillStyle = m.palette[m.cells[row][col]].hex;
  ctx.fillRect(x0, y0, cellEdge(col + 1, l.cellW) - x0, cellEdge(row + 1, l.cellH) - y0);
}

export function drawChart(ctx: CanvasRenderingContext2D, m: StitchMatrix, l: ChartLayout) {
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) fillCell(ctx, m, l, c, r);
}

/** Repaint only the given stitches (used while dragging, so a stroke stays smooth on a big chart). */
export function drawStitches(ctx: CanvasRenderingContext2D, m: StitchMatrix, l: ChartLayout, stitches: Iterable<Stitch>) {
  for (const s of stitches) if (s.col >= 0 && s.col < m.cols && s.row >= 0 && s.row < m.rows) fillCell(ctx, m, l, s.col, s.row);
}
