import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import { stitchLabel } from "./coords";
import type { Stitch } from "./coords";
import { colorCounts } from "./paint";
import { EditorSession } from "./session";
import type { PointerInput, SessionEffect } from "./session";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = [pal("#ffffff"), pal("#111111"), pal("#c0392b"), pal("#2a6fdb")];

/** A small chart with a recognisable layout: column index in the top row, row index down the left. */
function sample(cols = 12, rows = 16): StitchMatrix {
  const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r === 0 ? 1 : c === 0 ? 2 : 0)));
  return { cols, rows, palette: PALETTE, cells };
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}
const CELL = 10;
const at = (x: number, y: number): Stitch | null => {
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  return x < 0 || y < 0 || col >= 12 || row >= 16 ? null : { col, row };
};
const centre = (c: number, r: number) => [c * CELL + 5, r * CELL + 5] as const;

const down = (id: number, kind: "mouse" | "touch" | "pen", [x, y]: readonly [number, number], button = 0): PointerInput => ({ type: "down", id, kind, x, y, button });
const move = (id: number, [x, y]: readonly [number, number]): PointerInput => ({ type: "move", id, x, y });
const up = (id: number): PointerInput => ({ type: "up", id });
const cancel = (id: number): PointerInput => ({ type: "cancel", id });

function play(s: EditorSession, inputs: PointerInput[]): SessionEffect[] {
  return inputs.flatMap((i) => s.handle(i, at));
}

describe("display numbering is display only", () => {
  it("row 1 is the bottom row, stitches count from the left, and the matrix is never reordered", () => {
    const converted = deepFreeze(sample());
    const s = new EditorSession(converted);
    s.setActive(3);
    // Paint the stitch drawn at the very top-left of the chart and the one at the very bottom-right.
    play(s, [down(1, "mouse", centre(0, 0)), up(1), down(1, "mouse", centre(11, 15)), up(1)]);
    expect(s.matrix.cells[0][0]).toBe(3); // matrix row 0 is the TOP row
    expect(s.matrix.cells[15][11]).toBe(3); // matrix row 15 is the BOTTOM row
    expect(stitchLabel({ col: 0, row: 0 }, 16, 12)).toEqual({ stitch: 12, row: 16 }); // top-left = row 16, last stitch
    expect(stitchLabel({ col: 11, row: 15 }, 16, 12)).toEqual({ stitch: 1, row: 1 }); // bottom-right = row 1, stitch 1
    // nothing else moved
    const expected = sample();
    expected.cells[0][0] = 3;
    expected.cells[15][11] = 3;
    expect(s.matrix.cells).toEqual(expected.cells);
    expect(s.matrix.cols).toBe(12);
    expect(s.matrix.rows).toBe(16);
  });
});

describe("a stroke", () => {
  it("is one committed edit, reported once, with the number of changed stitches", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    const fx = play(s, [down(1, "mouse", centre(2, 4)), move(1, centre(5, 4)), move(1, centre(5, 8)), up(1)]);
    expect(fx.filter((e) => e.type === "committed")).toEqual([{ type: "committed", action: "paint", changed: 8, stitches: 8 }]);
    for (let c = 2; c <= 5; c++) expect(s.matrix.cells[4][c]).toBe(1);
    for (let r = 4; r <= 8; r++) expect(s.matrix.cells[r][5]).toBe(1);
  });
  it("tapping the stitch that already has that color changes nothing and commits nothing", () => {
    const s = new EditorSession(sample());
    s.setActive(0);
    const before = s.matrix;
    const fx = play(s, [down(1, "mouse", centre(6, 6)), up(1)]);
    expect(fx.some((e) => e.type === "committed")).toBe(false);
    expect(s.matrix).toBe(before);
  });
  it("leaving the chart and coming back does not draw a line across the gap", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "mouse", centre(1, 8)), move(1, [-20, 85]), move(1, centre(10, 8)), up(1)]);
    for (let c = 2; c <= 9; c++) expect(s.matrix.cells[8][c]).toBe(0);
    expect(s.matrix.cells[8][1]).toBe(1);
    expect(s.matrix.cells[8][10]).toBe(1);
  });
});

describe("colors that run out of stitches stay in the palette", () => {
  it("painting over every stitch of a color leaves it listed with a count of 0", () => {
    const s = new EditorSession(sample());
    s.setActive(0);
    // paint the whole first column (color 2) and the first row (color 1) white
    play(s, [down(1, "mouse", centre(0, 0)), move(1, centre(0, 15)), up(1), down(1, "mouse", centre(0, 0)), move(1, centre(11, 0)), up(1)]);
    const counts = colorCounts(s.matrix);
    expect(counts[1]).toBe(0);
    expect(counts[2]).toBe(0);
    expect(s.matrix.palette).toHaveLength(4);
    expect(s.matrix.palette).toBe(s.converted.palette);
    // and the lost color can still be painted back
    s.setActive(2);
    play(s, [down(1, "mouse", centre(3, 3)), up(1)]);
    expect(s.matrix.cells[3][3]).toBe(2);
  });
  it("cannot select or paint a color the chart does not have", () => {
    const s = new EditorSession(sample());
    expect(() => s.setActive(4)).toThrow(RangeError);
    expect(() => s.setActive(-1)).toThrow(RangeError);
    expect(s.active).toBe(0);
  });
});

describe("reset to converted", () => {
  it("restores exactly the converted chart; the converted chart itself is never modified", () => {
    const converted = deepFreeze(sample()); // any write to it would throw
    const frozenCopy = JSON.stringify(converted);
    const s = new EditorSession(converted);
    s.setActive(3);
    play(s, [down(1, "mouse", centre(1, 1)), move(1, centre(10, 12)), up(1)]);
    expect(s.changedCount()).toBeGreaterThan(0);
    s.reset();
    expect(s.matrix).toBe(converted);
    expect(s.changedCount()).toBe(0);
    expect(JSON.stringify(converted)).toBe(frozenCopy);
  });
  it("editing again after a reset works and is counted from the converted chart", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "mouse", centre(5, 5)), up(1)]);
    s.reset();
    play(s, [down(1, "mouse", centre(6, 6)), move(1, centre(8, 6)), up(1)]);
    expect(s.changedCount()).toBe(3);
    expect(s.matrix.cells[5][5]).toBe(0);
  });
  it("a reset in the middle of a stroke ends that stroke: nothing is painted afterwards", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "touch", centre(5, 5)), move(1, centre(6, 5))]);
    s.reset();
    play(s, [move(1, centre(7, 5)), up(1)]);
    expect(s.matrix).toBe(s.converted);
  });
});

describe("protection against accidental edits", () => {
  const stream = (mode: "draw" | "pan", s: EditorSession) => {
    s.mode = mode;
    return s;
  };

  it("Pan mode never paints, with mouse, touch, or pen", () => {
    for (const kind of ["mouse", "touch", "pen"] as const) {
      const s = stream("pan", new EditorSession(sample()));
      s.setActive(1);
      const fx = play(s, [down(1, kind, centre(4, 4)), move(1, centre(9, 9)), up(1)]);
      expect(s.matrix).toBe(s.converted);
      expect(fx.every((e) => e.type === "pan")).toBe(true);
    }
  });

  it("two fingers pan and zoom, and never paint", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    const fx = play(s, [down(1, "touch", [40, 80]), down(2, "touch", [80, 80]), move(2, [100, 80]), move(1, [20, 80]), up(1), up(2)]);
    expect(s.matrix).toBe(s.converted);
    expect(fx.some((e) => e.type === "pinch")).toBe(true);
  });

  it("a second finger landing mid-stroke undoes everything that stroke painted", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "touch", centre(2, 6)), move(1, centre(8, 6))]);
    expect(s.changedCount()).toBeGreaterThan(0); // it really had painted
    const fx = play(s, [down(2, "touch", centre(2, 12))]);
    expect(s.matrix).toBe(s.converted);
    expect(fx.some((e) => e.type === "repaint")).toBe(true); // screen told to redraw the undone stitches
    play(s, [move(1, centre(9, 6)), move(2, centre(9, 12)), up(1), up(2)]);
    expect(s.matrix).toBe(s.converted);
  });

  it("a touch the browser takes over (cancel) undoes the stroke", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "touch", centre(2, 6)), move(1, centre(8, 6)), cancel(1)]);
    expect(s.matrix).toBe(s.converted);
  });

  it("a stroke interrupted by the view changing is undone", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "mouse", centre(2, 6)), move(1, centre(8, 6))]);
    s.cancelGesture();
    expect(s.matrix).toBe(s.converted);
    play(s, [move(1, centre(9, 6)), up(1)]);
    expect(s.matrix).toBe(s.converted);
  });

  it("Space, the middle button and the right button never paint", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    s.space = true;
    play(s, [down(1, "mouse", centre(4, 4)), move(1, centre(9, 9)), up(1)]);
    s.space = false;
    play(s, [down(1, "mouse", centre(4, 4), 1), move(1, centre(9, 9)), up(1)]);
    play(s, [down(1, "mouse", centre(4, 4), 2), move(1, centre(9, 9)), up(1)]);
    expect(s.matrix).toBe(s.converted);
  });

  it("after a pinch, the finger left on the screen cannot paint", () => {
    const s = new EditorSession(sample());
    s.setActive(1);
    play(s, [down(1, "touch", centre(1, 1)), down(2, "touch", centre(9, 9)), up(2), move(1, centre(5, 5)), move(1, centre(6, 6)), up(1)]);
    expect(s.matrix).toBe(s.converted);
    // and the next touch paints normally
    play(s, [down(3, "touch", centre(6, 6)), up(3)]);
    expect(s.matrix.cells[6][6]).toBe(1);
  });

  it("whatever happens, a Pan-mode session never changes the chart (random input)", () => {
    let seed = 2024;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 150; trial++) {
      const s = stream("pan", new EditorSession(sample()));
      s.setActive(1);
      for (let i = 0; i < 40; i++) {
        const id = rnd(3) + 1;
        const k = rnd(5);
        const p = [rnd(130), rnd(170)] as const;
        const input: PointerInput =
          k === 0 ? down(id, rnd(2) ? "touch" : "mouse", p, rnd(3)) : k === 1 || k === 2 ? move(id, p) : k === 3 ? up(id) : cancel(id);
        s.handle(input, at);
      }
      expect(s.matrix).toBe(s.converted);
    }
  });

  it("whatever happens in Draw mode, the chart stays valid, keeps its palette and never uses a new color (random input)", () => {
    const spec = buildGridSpec({ sizeId: "6x8", orientation: "portrait", maxColors: 4 });
    let seed = 77;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 150; trial++) {
      const base = sample(spec.cols, spec.rows);
      const s = new EditorSession(base);
      const toStitch = (x: number, y: number): Stitch | null => {
        const col = Math.floor(x / CELL);
        const row = Math.floor(y / CELL);
        return x < 0 || y < 0 || col >= spec.cols || row >= spec.rows ? null : { col, row };
      };
      for (let i = 0; i < 60; i++) {
        s.setActive(rnd(4));
        s.mode = rnd(4) === 0 ? "pan" : "draw";
        s.space = rnd(8) === 0;
        const id = rnd(3) + 1;
        const k = rnd(6);
        const p = [rnd(spec.cols * CELL + 20) - 10, rnd(spec.rows * CELL + 20) - 10] as const;
        const input: PointerInput =
          k === 0 ? down(id, rnd(2) ? "touch" : "mouse", p, rnd(3)) : k <= 2 ? move(id, p) : k === 3 ? up(id) : k === 4 ? cancel(id) : move(id, p);
        s.handle(input, toStitch);
        expect(validateMatrix(s.matrix, spec)).toEqual([]);
      }
      expect(s.matrix.palette).toBe(base.palette);
    }
  });
});
