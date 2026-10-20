/** "Strengthen thin lines" is offered from 12 x 16 up: the two smallest sizes have too few stitches for a one-stitch line to look like a line. */
export const STRENGTHEN_MIN_COLS = 48; // 12 x 16 in portrait and larger; not on the two smallest sizes

export function strengthenOffered(cols: number): boolean {
  return cols >= STRENGTHEN_MIN_COLS;
}

/** Whether to apply it: only when it is offered for this size AND the person ticked it. */
export function strengthenActive(ticked: boolean, cols: number): boolean {
  return ticked && strengthenOffered(cols);
}
