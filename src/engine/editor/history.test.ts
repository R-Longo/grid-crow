import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { floodFill } from "./fill";
import { History, applyEdit, editMatches, makeEdit } from "./history";
import { paintStitches, stitchesOnSegment } from "./paint";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = [pal("#ffffff"), pal("#111111"), pal("#c0392b"), pal("#2a6fdb")];
const blank = (cols: number, rows: number): StitchMatrix => ({ cols, rows, palette: PALETTE, cells: Array.from({ length: rows }, () => new Array<number>(cols).fill(0)) });

describe("makeEdit / applyEdit", () => {
  it("records only the stitches that changed, with their before and after colors", () => {
    const a = blank(6, 4);
    const { matrix: b } = paintStitches(a, [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 0, row: 0 }], 2);
    const e = makeEdit("paint", [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 3 } /* unchanged */, { col: 1, row: 1 } /* duplicate */], a, b);
    expect(e.index.length).toBe(2);
    expect([...e.before]).toEqual([0, 0]);
    expect([...e.after]).toEqual([2, 2]);
  });
  it("undo and redo are exact inverses and never touch the old matrix", () => {
    const a = blank(6, 4);
    const { matrix: b, changed } = floodFill(a, { col: 0, row: 0 }, 3);
    const e = makeEdit("fill", changed, a, b);
    expect(editMatches(b, e, "undo")).toBe(true);
    const bBefore = JSON.stringify(b);
    const u = applyEdit(b, e, "undo");
    expect(JSON.stringify(b)).toBe(bBefore);
    expect(u.matrix.cells).toEqual(a.cells);
    expect(editMatches(u.matrix, e, "redo")).toBe(true);
    expect(applyEdit(u.matrix, e, "redo").matrix.cells).toEqual(b.cells);
    expect(u.stitches).toHaveLength(24);
  });
});

describe("History", () => {
  const edit = (n: number, start = 0) => {
    const a = blank(50, 50);
    const stitches = Array.from({ length: n }, (_, i) => ({ col: (start + i) % 50, row: Math.floor((start + i) / 50) }));
    const { matrix: b } = paintStitches(a, stitches, 1);
    return makeEdit("paint", stitches, a, b);
  };

  it("starts empty", () => {
    const h = new History();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.popUndo()).toBeNull();
    expect(h.popRedo()).toBeNull();
  });
  it("undo then redo walks back and forth over the same actions, in order", () => {
    const h = new History();
    const [e1, e2, e3] = [edit(1), edit(2), edit(3)];
    h.push(e1); h.push(e2); h.push(e3);
    expect(h.popUndo()).toBe(e3);
    expect(h.popUndo()).toBe(e2);
    expect(h.canRedo).toBe(true);
    expect(h.popRedo()).toBe(e2);
    expect(h.popRedo()).toBe(e3);
    expect(h.popRedo()).toBeNull();
    expect(h.size).toBe(3);
  });
  it("a new action clears whatever could have been redone", () => {
    const h = new History();
    h.push(edit(1)); h.push(edit(2));
    h.popUndo();
    expect(h.canRedo).toBe(true);
    h.push(edit(3));
    expect(h.canRedo).toBe(false);
  });
  it("ignores an action that changed nothing", () => {
    const h = new History();
    h.push(makeEdit("paint", [], blank(2, 2), blank(2, 2)));
    expect(h.canUndo).toBe(false);
  });
  it("keeps at most the allowed number of actions, dropping the oldest", () => {
    const h = new History({ maxActions: 3, maxStitches: 1e9 });
    const es = [edit(1), edit(2), edit(3), edit(4), edit(5)];
    es.forEach((e) => h.push(e));
    expect(h.size).toBe(3);
    expect(h.popUndo()).toBe(es[4]);
    expect(h.popUndo()).toBe(es[3]);
    expect(h.popUndo()).toBe(es[2]);
    expect(h.popUndo()).toBeNull();
  });
  it("keeps total memory bounded by dropping the oldest actions, but always keeps the newest", () => {
    const h = new History({ maxActions: 1000, maxStitches: 100 });
    for (let i = 0; i < 10; i++) h.push(edit(30));
    expect(h.size).toBe(3);
    const huge = edit(200);
    h.push(huge);
    expect(h.size).toBe(1);
    expect(h.popUndo()).toBe(huge);
  });
  it("clear forgets everything", () => {
    const h = new History();
    h.push(edit(1)); h.popUndo();
    h.clear();
    expect(h.canUndo || h.canRedo).toBe(false);
  });
});

describe("undo/redo over long random sessions", () => {
  it("undoing everything returns to the start; redoing everything returns to the end; every step matches", () => {
    let seed = 4242;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 20; trial++) {
      const start = blank(20, 20);
      let m = start;
      const h = new History();
      for (let i = 0; i < 80; i++) {
        const before = m;
        if (rnd(3) === 0) {
          const r = floodFill(m, { col: rnd(20), row: rnd(20) }, rnd(4));
          m = r.matrix;
          h.push(makeEdit("fill", r.changed, before, m));
        } else {
          const line = stitchesOnSegment({ col: rnd(20), row: rnd(20) }, { col: rnd(20), row: rnd(20) });
          const r = paintStitches(m, line, rnd(4));
          m = r.matrix;
          h.push(makeEdit("paint", r.changed, before, m));
        }
      }
      const end = m;
      let e;
      while ((e = h.popUndo())) {
        expect(editMatches(m, e, "undo")).toBe(true);
        m = applyEdit(m, e, "undo").matrix;
      }
      expect(m.cells).toEqual(start.cells);
      while ((e = h.popRedo())) {
        expect(editMatches(m, e, "redo")).toBe(true);
        m = applyEdit(m, e, "redo").matrix;
      }
      expect(m.cells).toEqual(end.cells);
      expect(m.palette).toBe(start.palette);
    }
  });
});
