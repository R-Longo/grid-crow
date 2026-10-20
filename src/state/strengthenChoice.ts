/** "Strengthen thin lines" is offered once the chart has enough stitches for a one-stitch line to look like a line. */
export const STRENGTHEN_MIN_COLS = 64; // 16 x 20 in portrait and larger

export function strengthenOffered(cols: number): boolean {
  return cols >= STRENGTHEN_MIN_COLS;
}

/** Whether to apply it: only when it is offered for this size AND the person ticked it. */
export function strengthenActive(ticked: boolean, cols: number): boolean {
  return ticked && strengthenOffered(cols);
}
