import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import { floodFill } from "./fill";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = [pal("#ffffff"), pal("#111111"), pal("#c0392b"), pal("#2a6fdb")];
const fromRows = (rows: string[]): StitchMatrix => ({
  cols: rows[0].length,
  rows: rows.length,
  palette: PALETTE,
  cells: rows.map((r) => [...r].map((ch) => "wbrl".indexOf(ch))),
});
const toRows = (m: StitchMatrix) => m.cells.map((r) => r.map((v) => "wbrl"[v]).join(""));

/** Slow, obviously-correct reference: repeat "spread to 4-neighbours" until nothing changes. */
function reference(m: StitchMatrix, col: number, row: number): Set<number> {
  const target = m.cells[row][col];
  const inside = new Set<number>([row * m.cols + col]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const i of [...inside]) {
      const r = Math.floor(i / m.cols);
      const c = i % m.cols;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= m.rows || cc >= m.cols) continue;
        if (m.cells[rr][cc] === target && !inside.has(rr * m.cols + cc)) {
          inside.add(rr * m.cols + cc);
          grew = true;
        }
      }
    }
  }
  return inside;
}

describe("floodFill", () => {
  it("fills exactly the connected region, and stops at other colors", () => {
    const m = fromRows([
      "wwwbwww",
      "wwwbwww",
      "bbbbwww",
      "wwwbbbb",
      "wwwbwww",
    ]);
    const { matrix, changed } = floodFill(m, { col: 0, row: 0 }, 2);
    expect(toRows(matrix)).toEqual([
      "rrrbwww",
      "rrrbwww",
      "bbbbwww",
      "wwwbbbb",
      "wwwbwww",
    ]);
    expect(changed).toHaveLength(6);
  });
  it("does not leak through a diagonal gap (regions connect by edges only)", () => {
    const m = fromRows([
      "wb",
      "bw",
    ]);
    const { matrix, changed } = floodFill(m, { col: 0, row: 0 }, 2);
    expect(toRows(matrix)).toEqual(["rb", "bw"]);
    expect(changed).toHaveLength(1);
  });
  it("fills a lone stitch, a whole chart, and a region around a hole", () => {
    expect(toRows(floodFill(fromRows(["wbw"]), { col: 1, row: 0 }, 3).matrix)).toEqual(["wlw"]);
    expect(toRows(floodFill(fromRows(["www", "www"]), { col: 2, row: 1 }, 1).matrix)).toEqual(["bbb", "bbb"]);
    const ring = fromRows(["wwwww", "wbbbw", "wbwbw", "wbbbw", "wwwww"]);
    expect(toRows(floodFill(ring, { col: 0, row: 0 }, 2).matrix)).toEqual(["rrrrr", "rbbbr", "rbwbr", "rbbbr", "rrrrr"]);
    expect(toRows(floodFill(ring, { col: 2, row: 2 }, 3).matrix)).toEqual(["wwwww", "wbbbw", "wblbw", "wbbbw", "wwwww"]);
  });
  it("filling with the color a region already has does nothing (same matrix object, no changes)", () => {
    const m = fromRows(["wbw"]);
    const r = floodFill(m, { col: 0, row: 0 }, 0);
    expect(r.matrix).toBe(m);
    expect(r.changed).toEqual([]);
  });
  it("a start outside the chart does nothing", () => {
    const m = fromRows(["wbw"]);
    for (const s of [{ col: -1, row: 0 }, { col: 3, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 }]) expect(floodFill(m, s, 1).matrix).toBe(m);
  });
  it("refuses a color the chart does not have, so the palette cannot grow", () => {
    const m = fromRows(["ww"]);
    for (const bad of [4, -1, 0.5, NaN]) expect(() => floodFill(m, { col: 0, row: 0 }, bad)).toThrow(RangeError);
  });
  it("returns a new matrix and leaves the old one untouched; unchanged rows are shared; palette is the same object", () => {
    const m = fromRows(["wwww", "bbbb", "wwww"]);
    const before = JSON.stringify(m);
    const { matrix } = floodFill(m, { col: 0, row: 0 }, 2);
    expect(JSON.stringify(m)).toBe(before);
    expect(matrix.cells[1]).toBe(m.cells[1]);
    expect(matrix.cells[0]).not.toBe(m.cells[0]);
    expect(matrix.palette).toBe(m.palette);
  });
  it("matches a slow reference on many random charts, from every start stitch", () => {
    let seed = 31337;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 60; trial++) {
      const cols = 3 + rnd(9);
      const rows = 3 + rnd(9);
      const m: StitchMatrix = { cols, rows, palette: PALETTE, cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rnd(3) === 0 ? 1 : rnd(2) ? 0 : 2))) };
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const want = reference(m, c, r);
          const fillColor = (m.cells[r][c] + 1) % 4;
          const { matrix, changed } = floodFill(m, { col: c, row: r }, fillColor);
          expect(new Set(changed)).toEqual(want);
          for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) expect(matrix.cells[rr][cc]).toBe(want.has(rr * cols + cc) ? fillColor : m.cells[rr][cc]);
        }
    }
  });
  it("fills the largest charts at once without trouble, and quickly", () => {
    for (const [sizeId, orientation] of [["24x32", "portrait"], ["24x32", "landscape"]] as const) {
      const spec = buildGridSpec({ sizeId, orientation, maxColors: 4 });
      const m: StitchMatrix = { cols: spec.cols, rows: spec.rows, palette: PALETTE, cells: Array.from({ length: spec.rows }, () => new Array<number>(spec.cols).fill(0)) };
      const t0 = performance.now();
      const { matrix, changed } = floodFill(m, { col: 0, row: 0 }, 1);
      const ms = performance.now() - t0;
      expect(changed).toHaveLength(spec.cols * spec.rows);
      expect(validateMatrix(matrix, spec)).toEqual([]);
      expect(ms).toBeLessThan(500); // generous: it takes a few milliseconds; this only catches a runaway
      // worst case for a flood: a serpentine corridor one stitch wide
      const snake: StitchMatrix = { ...m, cells: m.cells.map((row, r) => row.map((_, c) => (r % 2 === 1 && !(r % 4 === 1 ? c === spec.cols - 1 : c === 0) ? 1 : 0))) };
      const t1 = performance.now();
      const s = floodFill(snake, { col: 0, row: 0 }, 2);
      expect(performance.now() - t1).toBeLessThan(500);
      expect(s.changed.length).toBeGreaterThan(spec.cols);
    }
  });
});
