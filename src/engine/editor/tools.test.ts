import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { convertRaster } from "../convert/convert";
import { DEFAULT_CROP } from "../convert/crop";
import type { Raster, StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import type { Stitch } from "./coords";
import { colorCounts } from "./paint";
import { EditorSession } from "./session";
import type { PointerInput, SessionEffect } from "./session";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = [pal("#ffffff"), pal("#111111"), pal("#c0392b"), pal("#2a6fdb")];

/** 12 x 16: white field, a black vertical wall at column 6 that has a gap at the bottom, a red block top-left. */
function sample(): StitchMatrix {
  const cols = 12;
  const rows = 16;
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (c === 6 && r < 14 ? 1 : r < 3 && c < 3 ? 2 : 0)),
  );
  return { cols, rows, palette: PALETTE, cells };
}
const CELL = 10;
const at = (x: number, y: number): Stitch | null => {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  return x < 0 || y < 0 || col >= 12 || row >= 16 ? null : { col, row };
};
const centre = (c: number, r: number) => [c * CELL + 5, r * CELL + 5] as const;
const down = (id: number, kind: "mouse" | "touch", [x, y]: readonly [number, number]): PointerInput => ({ type: "down", id, kind, x, y, button: 0 });
const move = (id: number, [x, y]: readonly [number, number]): PointerInput => ({ type: "move", id, x, y });
const up = (id: number): PointerInput => ({ type: "up", id });
const cancel = (id: number): PointerInput => ({ type: "cancel", id });
const play = (s: EditorSession, inputs: PointerInput[]): SessionEffect[] => inputs.flatMap((i) => s.handle(i, at));
const tap = (s: EditorSession, c: number, r: number, kind: "mouse" | "touch" = "mouse") => play(s, [down(1, kind, centre(c, r)), up(1)]);
const cellsOf = (m: StitchMatrix) => JSON.stringify(m.cells);

describe("brush strokes are single undo steps", () => {
  it("a long, winding stroke is ONE action: one undo removes all of it, one redo puts all of it back", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    play(s, [down(1, "mouse", centre(1, 5)), move(1, centre(5, 5)), move(1, centre(5, 12)), move(1, centre(1, 12)), move(1, centre(1, 7)), up(1)]);
    const painted = cellsOf(s.matrix);
    expect(s.changedCount()).toBeGreaterThan(15);
    const fx = s.undo();
    expect(cellsOf(s.matrix)).toBe(cellsOf(s.converted));
    expect(fx).toContainEqual(expect.objectContaining({ type: "committed", action: "undo", changed: 0 }));
    expect(s.canUndo).toBe(false);
    s.redo();
    expect(cellsOf(s.matrix)).toBe(painted);
    expect(s.canRedo).toBe(false);
  });
  it("two strokes are two actions, undone newest first", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    play(s, [down(1, "mouse", centre(1, 5)), move(1, centre(4, 5)), up(1)]);
    const afterFirst = cellsOf(s.matrix);
    play(s, [down(1, "mouse", centre(1, 9)), move(1, centre(4, 9)), up(1)]);
    s.undo();
    expect(cellsOf(s.matrix)).toBe(afterFirst);
    s.undo();
    expect(cellsOf(s.matrix)).toBe(cellsOf(s.converted));
  });
  it("undo/redo tell the screen exactly which stitches to redraw", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    tap(s, 2, 8);
    const fx = s.undo();
    expect(fx.find((e) => e.type === "repaint")).toEqual({ type: "repaint", stitches: [{ col: 2, row: 8 }] });
  });
  it("a tap on a stitch that already has the color is not an action", () => {
    const s = new EditorSession(sample());
    s.setActive(0);
    tap(s, 9, 9);
    expect(s.canUndo).toBe(false);
  });
});

describe("flood fill", () => {
  it("fills the connected region under the pointer when it is let go: one action", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    s.tool = "fill";
    const fx = tap(s, 9, 2);
    // the wall has a gap at the bottom, so the white field on both sides is one region
    expect(s.matrix.cells[0][0]).toBe(2); // the red block is untouched
    expect(s.matrix.cells[5][9]).toBe(3);
    expect(s.matrix.cells[5][2]).toBe(3);
    expect(s.matrix.cells[5][6]).toBe(1); // the wall is untouched
    expect(fx.filter((e) => e.type === "committed")).toHaveLength(1);
    const whiteBefore = colorCounts(s.converted)[0];
    expect(colorCounts(s.matrix)[3]).toBe(whiteBefore);
    s.undo();
    expect(cellsOf(s.matrix)).toBe(cellsOf(s.converted));
    s.redo();
    expect(colorCounts(s.matrix)[3]).toBe(whiteBefore);
  });
  it("fills the region under the pointer at release, not at press", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    s.tool = "fill";
    play(s, [down(1, "mouse", centre(9, 2)), move(1, centre(6, 5)), move(1, centre(1, 10)), up(1)]); // released on white, left of the wall
    expect(s.matrix.cells[10][1]).toBe(3);
    // a fill is one flat region (no brush line was painted on the way)
    expect(s.matrix.cells[5][6]).toBe(1);
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.canUndo).toBe(false);
  });
  it("released off the chart, it does nothing", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    s.tool = "fill";
    play(s, [down(1, "mouse", centre(9, 2)), move(1, [-30, 40]), up(1)]);
    expect(s.matrix).toBe(s.converted);
    expect(s.canUndo).toBe(false);
  });
  it("filling a region with its own color is not an action", () => {
    const s = new EditorSession(sample());
    s.setActive(0);
    s.tool = "fill";
    tap(s, 9, 2);
    expect(s.canUndo).toBe(false);
  });
  it("a second finger or a cancelled touch means no fill happens", () => {
    for (const interrupt of ["second-finger", "cancel"] as const) {
      const s = new EditorSession(sample());
      s.setActive(3);
      s.tool = "fill";
      if (interrupt === "second-finger") play(s, [down(1, "touch", centre(9, 2)), down(2, "touch", centre(2, 12)), up(2), up(1)]);
      else play(s, [down(1, "touch", centre(9, 2)), cancel(1)]);
      expect(s.matrix).toBe(s.converted);
      expect(s.canUndo).toBe(false);
    }
  });
  it("Pan mode never fills", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    s.tool = "fill";
    s.mode = "pan";
    tap(s, 9, 2, "touch");
    expect(s.matrix).toBe(s.converted);
  });
});

describe("eyedropper", () => {
  it("takes the color of the stitch it is released on, then goes back to painting; the chart does not change", () => {
    const s = new EditorSession(sample());
    s.tool = "pick";
    const fx = tap(s, 1, 1); // red block
    expect(s.active).toBe(2);
    expect(s.tool).toBe("paint");
    expect(fx).toContainEqual({ type: "picked", color: 2 });
    expect(s.matrix).toBe(s.converted);
    expect(s.canUndo).toBe(false);
    // and the next tap paints with it
    tap(s, 9, 9);
    expect(s.matrix.cells[9][9]).toBe(2);
  });
  it("only ever picks a color that is in the chart", () => {
    const s = new EditorSession(sample());
    for (let c = 0; c < 12; c++) {
      s.tool = "pick";
      tap(s, c, 8);
      expect(s.active).toBeGreaterThanOrEqual(0);
      expect(s.active).toBeLessThan(s.matrix.palette.length);
    }
  });
  it("does nothing when released off the chart, interrupted by a second finger, or cancelled", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    s.tool = "pick";
    play(s, [down(1, "mouse", centre(1, 1)), move(1, [-20, 40]), up(1)]);
    expect(s.active).toBe(3);
    expect(s.tool).toBe("pick");
    play(s, [down(1, "touch", centre(1, 1)), down(2, "touch", centre(5, 5)), up(2), up(1)]);
    expect(s.active).toBe(3);
    play(s, [down(1, "touch", centre(1, 1)), cancel(1)]);
    expect(s.active).toBe(3);
  });
  it("a color that has run out of stitches can still be picked back from the palette (it stays listed)", () => {
    const s = new EditorSession(sample());
    s.setActive(0);
    s.tool = "fill";
    tap(s, 1, 1); // paint red block white by filling it
    expect(colorCounts(s.matrix)[2]).toBe(0);
    expect(s.matrix.palette).toHaveLength(4);
    s.setActive(2);
    expect(s.active).toBe(2);
  });
});

describe("undo and redo rules", () => {
  it("a new edit after an undo ends the redo chain", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    tap(s, 1, 5);
    tap(s, 2, 5);
    s.undo();
    expect(s.canRedo).toBe(true);
    tap(s, 3, 5);
    expect(s.canRedo).toBe(false);
    expect(s.redo()).toEqual([]);
  });
  it("undo and redo wait while a stroke or touch is in progress", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    tap(s, 1, 5);
    play(s, [down(1, "mouse", centre(5, 9)), move(1, centre(7, 9))]);
    expect(s.canUndo).toBe(false);
    expect(s.undo()).toEqual([]);
    play(s, [up(1)]);
    expect(s.canUndo).toBe(true);
    // a touch that is only panning also blocks it
    s.mode = "pan";
    play(s, [down(2, "touch", centre(1, 1))]);
    expect(s.undo()).toEqual([]);
    play(s, [up(2)]);
    expect(s.undo().length).toBeGreaterThan(0);
  });
  it("nothing to undo or redo is harmless", () => {
    const s = new EditorSession(sample());
    expect(s.undo()).toEqual([]);
    expect(s.redo()).toEqual([]);
    expect(s.matrix).toBe(s.converted);
  });
  it("Reset clears the history, and edits made after it are undoable back to the converted chart", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    tap(s, 1, 5);
    s.undo();
    s.reset();
    expect(s.canUndo || s.canRedo).toBe(false);
    expect(s.undo()).toEqual([]);
    tap(s, 2, 6);
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.matrix.cells).toEqual(s.converted.cells);
  });
  it("the changed-stitch count follows undo and redo", () => {
    const s = new EditorSession(sample());
    s.setActive(3);
    play(s, [down(1, "mouse", centre(1, 5)), move(1, centre(4, 5)), up(1)]);
    expect(s.changedCount()).toBe(4);
    expect(s.undo()).toContainEqual(expect.objectContaining({ type: "committed", action: "undo", changed: 0, stitches: 4 }));
    expect(s.redo()).toContainEqual(expect.objectContaining({ type: "committed", action: "redo", changed: 4, stitches: 4 }));
  });
});

describe("whatever you do, the palette never grows and the chart stays valid", () => {
  it("random mixes of painting, filling, picking, undoing, redoing, panning and interruptions", () => {
    const spec = buildGridSpec({ sizeId: "6x8", orientation: "portrait", maxColors: 4 });
    let seed = 8080;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 80; trial++) {
      const base: StitchMatrix = {
        cols: spec.cols,
        rows: spec.rows,
        palette: PALETTE,
        cells: Array.from({ length: spec.rows }, () => Array.from({ length: spec.cols }, () => rnd(4))),
      };
      const s = new EditorSession(base);
      const toStitch = (x: number, y: number): Stitch | null => {
        const col = Math.floor(x / CELL);
        const row = Math.floor(y / CELL);
        return x < 0 || y < 0 || col >= spec.cols || row >= spec.rows ? null : { col, row };
      };
      for (let i = 0; i < 80; i++) {
        const k = rnd(10);
        if (k === 0) s.undo();
        else if (k === 1) s.redo();
        else if (k === 2 && rnd(10) === 0) s.reset();
        else {
          s.setActive(rnd(4));
          s.tool = (["paint", "fill", "pick"] as const)[rnd(3)];
          s.mode = rnd(5) === 0 ? "pan" : "draw";
          const id = rnd(2) + 1;
          const p = [rnd(spec.cols * CELL + 20) - 10, rnd(spec.rows * CELL + 20) - 10] as const;
          const kind = rnd(2) ? "touch" : "mouse";
          const a = rnd(4);
          const inputs: PointerInput[] =
            a === 0 ? [{ type: "down", id, kind, x: p[0], y: p[1], button: 0 }, { type: "move", id, x: rnd(300), y: rnd(300) }, { type: "up", id }] :
            a === 1 ? [{ type: "down", id, kind, x: p[0], y: p[1], button: 0 }, { type: "down", id: id + 5, kind: "touch", x: 5, y: 5, button: 0 }, { type: "up", id }, { type: "up", id: id + 5 }] :
            a === 2 ? [{ type: "down", id, kind, x: p[0], y: p[1], button: 0 }, { type: "cancel", id }] :
            [{ type: "down", id, kind, x: p[0], y: p[1], button: 0 }, { type: "up", id }];
          for (const input of inputs) s.handle(input, toStitch);
        }
        expect(validateMatrix(s.matrix, spec)).toEqual([]);
        expect(s.matrix.palette).toBe(base.palette);
        expect(s.matrix.palette.length).toBeLessThanOrEqual(4);
      }
      // drain: undo everything that is left, then the chart must equal the converted one
      while (s.canUndo) s.undo();
      expect(cellsOf(s.matrix)).toBe(cellsOf(base));
    }
  });
});

describe("long sessions on the largest charts", () => {
  const spec = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 10 });
  const buf = gunzipSync(readFileSync(new URL("../convert/fixtures/sun-card-34.rgba.gz", import.meta.url)));
  const raster: Raster = { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
  const rasterHash = createHash("sha1").update(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength)).digest("hex");
  const converted = convertRaster(raster, DEFAULT_CROP, spec);
  const toStitch = (x: number, y: number): Stitch | null => {
    const col = Math.floor(x / 4);
    const row = Math.floor(y / 4);
    return x < 0 || y < 0 || col >= spec.cols || row >= spec.rows ? null : { col, row };
  };

  it("200 long strokes and 30 whole-region fills on the converted sun card: undo all returns the converted chart exactly, redo all returns the edited chart exactly", () => {
    const s = new EditorSession(converted);
    let seed = 1;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const t0 = performance.now();
    for (let i = 0; i < 230; i++) {
      s.setActive(rnd(converted.palette.length));
      if (i % 8 === 7) {
        s.tool = "fill";
        s.handle({ type: "down", id: 1, kind: "mouse", x: rnd(spec.cols * 4) , y: rnd(spec.rows * 4), button: 0 }, toStitch);
        s.handle({ type: "up", id: 1 }, toStitch);
        s.tool = "paint";
      } else {
        s.handle({ type: "down", id: 1, kind: "mouse", x: rnd(spec.cols * 4), y: rnd(spec.rows * 4), button: 0 }, toStitch);
        for (let m = 0; m < 25; m++) s.handle({ type: "move", id: 1, x: rnd(spec.cols * 4), y: rnd(spec.rows * 4) }, toStitch);
        s.handle({ type: "up", id: 1 }, toStitch);
      }
    }
    const edited = cellsOf(s.matrix);
    expect(validateMatrix(s.matrix, spec)).toEqual([]);
    let undone = 0;
    while (s.canUndo) {
      s.undo();
      undone++;
    }
    expect(cellsOf(s.matrix)).toBe(cellsOf(converted));
    expect(undone).toBeGreaterThan(100);
    let redone = 0;
    while (s.canRedo) {
      s.redo();
      redone++;
    }
    expect(redone).toBe(undone);
    expect(cellsOf(s.matrix)).toBe(edited);
    expect(performance.now() - t0).toBeLessThan(15000); // generous ceiling; real time is a fraction of a second
    // the converted chart and the source picture were never touched
    expect(createHash("sha1").update(Buffer.from(raster.data.buffer, raster.data.byteOffset, raster.data.byteLength)).digest("hex")).toBe(rasterHash);
    expect(s.converted).toBe(converted);
  });
});
