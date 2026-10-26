/** "Strengthen thin lines" needs enough stitches for a one-stitch line to read as a line. */
export const STRENGTHEN_MIN_COLS = 48; // 12 x 16 in portrait and larger
/** A narrow-but-tall chart (9 x 16 portrait is 36 x 72) has plenty of room too. */
export const STRENGTHEN_MIN_STITCHES = 2500;

export function strengthenOffered(cols: number, rows: number): boolean {
  return cols >= STRENGTHEN_MIN_COLS || cols * rows >= STRENGTHEN_MIN_STITCHES;
}

/** Whether to apply it: only when it is offered for this size AND the person ticked it. */
export function strengthenActive(ticked: boolean, cols: number, rows: number): boolean {
  return ticked && strengthenOffered(cols, rows);
}
