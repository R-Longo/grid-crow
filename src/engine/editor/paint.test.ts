import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import { colorCounts, countDifferences, isPaletteIndex, paintStitches, stitchesOnSegment } from "./paint";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const make = (rows: number, cols: number, fill = 0): StitchMatrix => ({
  cols,
  rows,
  palette: [pal("#ffffff"), pal("#111111"), pal("#c0392b")],
  cells: Array.from({ length: rows }, () => new Array<number>(cols).fill(fill)),
});

describe("paintStitches", () => {
  it("returns a new matrix and leaves the old one exactly as it was", () => {
    const m = make(4, 5);
    const before = JSON.stringify(m);
    const { matrix, changed } = paintStitches(m, [{ col: 2, row: 1 }, { col: 3, row: 1 }], 1);
    expect(JSON.stringify(m)).toBe(before);
    expect(matrix.cells[1]).toEqual([0, 0, 1, 1, 0]);
    expect(changed).toHaveLength(2);
    expect(matrix).not.toBe(m);
  });
  it("shares rows it did not change and never copies the palette", () => {
    const m = make(4, 5);
    const { matrix } = paintStitches(m, [{ col: 0, row: 2 }], 2);
    expect(matrix.cells[0]).toBe(m.cells[0]);
    expect(matrix.cells[1]).toBe(m.cells[1]);
    expect(matrix.cells[2]).not.toBe(m.cells[2]);
    expect(matrix.palette).toBe(m.palette);
  });
  it("is a no-op (same object) when nothing changes", () => {
    const m = make(3, 3, 1);
    const r = paintStitches(m, [{ col: 1, row: 1 }], 1);
    expect(r.matrix).toBe(m);
    expect(r.changed).toEqual([]);
  });
  it("ignores stitches outside the chart", () => {
    const m = make(3, 3);
    const { matrix, changed } = paintStitches(m, [{ col: -1, row: 0 }, { col: 3, row: 0 }, { col: 0, row: 3 }, { col: 1, row: 1 }], 1);
    expect(changed).toEqual([{ col: 1, row: 1 }]);
    expect(matrix.cells.flat().filter((v) => v === 1)).toHaveLength(1);
  });
  it("refuses a color the chart does not have, so the palette can never grow", () => {
    const m = make(2, 2);
    for (const bad of [3, -1, 1.5, NaN]) expect(() => paintStitches(m, [{ col: 0, row: 0 }], bad)).toThrow(RangeError);
    expect(isPaletteIndex(m, 2)).toBe(true);
    expect(isPaletteIndex(m, 3)).toBe(false);
  });
  it("keeps the chart valid and the color count unchanged over many random edits", () => {
    const spec = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 4 });
    let m: StitchMatrix = { ...make(spec.rows, spec.cols), palette: [pal("#ffffff"), pal("#111111"), pal("#c0392b"), pal("#2a6fdb")] };
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let i = 0; i < 400; i++) {
      const a = { col: rnd(spec.cols), row: rnd(spec.rows) };
      const b = { col: rnd(spec.cols), row: rnd(spec.rows) };
      m = paintStitches(m, stitchesOnSegment(a, b), rnd(4)).matrix;
    }
    expect(validateMatrix(m, spec)).toEqual([]);
    expect(m.palette).toHaveLength(4);
    expect(colorCounts(m).reduce((x, y) => x + y, 0)).toBe(spec.cols * spec.rows);
  });
});

describe("stitchesOnSegment", () => {
  it("includes both ends and has no gaps, in every direction", () => {
    const ends = [
      [{ col: 0, row: 0 }, { col: 9, row: 3 }],
      [{ col: 9, row: 3 }, { col: 0, row: 0 }],
      [{ col: 2, row: 8 }, { col: 7, row: 1 }],
      [{ col: 4, row: 4 }, { col: 4, row: 4 }],
      [{ col: 1, row: 1 }, { col: 1, row: 9 }],
      [{ col: 0, row: 5 }, { col: 8, row: 5 }],
      [{ col: 0, row: 0 }, { col: 6, row: 6 }],
    ] as const;
    for (const [a, b] of ends) {
      const s = stitchesOnSegment(a, b);
      expect(s[0]).toEqual(a);
      expect(s[s.length - 1]).toEqual(b);
      expect(s).toHaveLength(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) + 1);
      for (let i = 1; i < s.length; i++) {
        expect(Math.abs(s[i].col - s[i - 1].col)).toBeLessThanOrEqual(1);
        expect(Math.abs(s[i].row - s[i - 1].row)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("countDifferences / colorCounts", () => {
  it("counts changed stitches and per-color totals", () => {
    const a = make(3, 3);
    const { matrix: b } = paintStitches(a, [{ col: 0, row: 0 }, { col: 2, row: 2 }], 2);
    expect(countDifferences(a, b)).toBe(2);
    expect(countDifferences(a, a)).toBe(0);
    expect(colorCounts(b)).toEqual([7, 0, 2]);
    expect(() => countDifferences(a, make(2, 3))).toThrow(RangeError);
  });
});
