import { describe, expect, it } from "vitest";
import { advance, clampProgress, isDone, nextStitch, orderOf, percentDone, positionOf, progressAfterTap, toEndOfRow } from "./progress";

describe("progress through the chart", () => {
  const cols = 4, rows = 3;
  it("starts at row 1, stitch 1 (bottom right) and runs right to left", () => {
    expect(positionOf(0, cols, rows)).toEqual({ row: 1, stitch: 1, col: 3, rowIndex: 2, direction: "left" });
    expect(positionOf(3, cols, rows)).toMatchObject({ row: 1, stitch: 4, col: 0 });
  });
  it("turns at the end of the row and runs left to right on row 2", () => {
    expect(positionOf(4, cols, rows)).toMatchObject({ row: 2, stitch: 4, col: 0, rowIndex: 1, direction: "right" });
    expect(positionOf(7, cols, rows)).toMatchObject({ row: 2, stitch: 1, col: 3 });
    expect(positionOf(8, cols, rows)).toMatchObject({ row: 3, stitch: 1, col: 3, direction: "left" });
  });
  it("orderOf is the inverse of positionOf for every stitch", () => {
    for (let n = 0; n < cols * rows; n++) {
      const p = positionOf(n, cols, rows);
      expect(orderOf(p.col, p.rowIndex, cols, rows)).toBe(n);
    }
  });
  it("marks exactly the stitches before the progress as done", () => {
    let done = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isDone(c, r, 6, cols, rows)) done++;
    expect(done).toBe(6);
    expect(isDone(3, 2, 1, cols, rows)).toBe(true);
    expect(isDone(2, 2, 1, cols, rows)).toBe(false);
  });
  it("tapping a stitch counts everything up to it", () => {
    expect(progressAfterTap(3, 2, cols, rows)).toBe(1);
    expect(progressAfterTap(0, 0, cols, rows)).toBe(12);
  });
  it("clamps, finishes, and counts what is left in the row", () => {
    expect(clampProgress(-3, cols, rows)).toBe(0);
    expect(clampProgress(99, cols, rows)).toBe(12);
    expect(clampProgress(NaN, cols, rows)).toBe(0);
    expect(advance(11, 5, cols, rows)).toBe(12);
    expect(nextStitch(12, cols, rows)).toBeNull();
    expect(toEndOfRow(0, cols, rows)).toBe(4);
    expect(toEndOfRow(5, cols, rows)).toBe(3);
    expect(percentDone(6, cols, rows)).toBe(50);
  });
});
