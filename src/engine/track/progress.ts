/**
 * Progress through a chart, as one whole number: how many stitches have been crocheted, counted in working order.
 * Row 1 is the bottom row and stitch 1 is on the right (the numbers printed on the chart's rulers). Worked flat, odd rows go
 * right to left and even rows go back left to right, so the stitch worked next moves along the row and then turns.
 *
 * Everything here is plain arithmetic on that number, so it can be tested without a screen.
 */

export interface Position {
  /** Row number as printed on the chart: 1 is the bottom row. */
  row: number;
  /** Stitch number as printed on the chart: 1 is the right-hand stitch. */
  stitch: number;
  /** Column in the matrix (0 is the left edge). */
  col: number;
  /** Row index in the matrix (0 is the top row). */
  rowIndex: number;
  /** Which way this row is worked. */
  direction: "left" | "right";
}

export function clampProgress(n: number, cols: number, rows: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(cols * rows, Math.floor(n)));
}

/** The stitch with this working-order index (0 is the very first stitch). */
export function positionOf(order: number, cols: number, rows: number): Position {
  const k = Math.floor(order / cols); // 0-based, from the bottom
  const j = order % cols;
  const odd = k % 2 === 0; // rows 1, 3, 5... run right to left
  const col = odd ? cols - 1 - j : j;
  return { row: k + 1, stitch: cols - col, col, rowIndex: rows - 1 - k, direction: odd ? "left" : "right" };
}

/** Working-order index of the stitch in this column and matrix row. */
export function orderOf(col: number, rowIndex: number, cols: number, rows: number): number {
  const k = rows - 1 - rowIndex;
  const j = k % 2 === 0 ? cols - 1 - col : col;
  return k * cols + j;
}

export function isDone(col: number, rowIndex: number, progress: number, cols: number, rows: number): boolean {
  return orderOf(col, rowIndex, cols, rows) < progress;
}

/** The stitch to work next, or null when the chart is finished. */
export function nextStitch(progress: number, cols: number, rows: number): Position | null {
  return progress >= cols * rows ? null : positionOf(progress, cols, rows);
}

/** Tapping a stitch means "I have worked up to and including this one". */
export function progressAfterTap(col: number, rowIndex: number, cols: number, rows: number): number {
  return orderOf(col, rowIndex, cols, rows) + 1;
}

export function advance(progress: number, by: number, cols: number, rows: number): number {
  return clampProgress(progress + by, cols, rows);
}

/** Stitches to go until the end of the current row (the whole row if it has just been finished, or not started). */
export function toEndOfRow(progress: number, cols: number, rows: number): number {
  if (progress >= cols * rows) return 0;
  return cols - (progress % cols);
}

export function percentDone(progress: number, cols: number, rows: number): number {
  const total = cols * rows;
  return total === 0 ? 0 : Math.floor((progress / total) * 100);
}
