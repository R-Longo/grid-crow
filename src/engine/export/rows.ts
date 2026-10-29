import type { StitchMatrix } from "../convert/types";
import { rowDirection } from "../editor/rulers";

export interface RowRun {
  /** Palette index and how many stitches in a row of this color. */
  index: number;
  count: number;
}

export interface RowInstruction {
  /** 1-based; row 1 is the bottom row of the chart. */
  row: number;
  /** Odd rows are the right side (RS), even rows the wrong side (WS). */
  side: "RS" | "WS";
  direction: "rtl" | "ltr";
  /** Runs of one color, in the order they are crocheted. */
  runs: RowRun[];
}

/** Every row as runs of one color, in working order (odd rows right to left, even rows left to right). Counts always add up to the chart width. */
export function rowInstructions(m: StitchMatrix): RowInstruction[] {
  const out: RowInstruction[] = [];
  for (let row = 1; row <= m.rows; row++) {
    const direction = rowDirection(row);
    const cells = m.cells[m.rows - row];
    const ordered = direction === "rtl" ? [...cells].reverse() : cells;
    const runs: RowRun[] = [];
    for (const index of ordered) {
      const last = runs[runs.length - 1];
      if (last && last.index === index) last.count++;
      else runs.push({ index, count: 1 });
    }
    out.push({ row, side: row % 2 === 1 ? "RS" : "WS", direction, runs });
  }
  return out;
}
