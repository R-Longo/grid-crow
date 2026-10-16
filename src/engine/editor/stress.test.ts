import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import type { Stitch } from "./coords";
import { HISTORY_LIMITS } from "./history";
import { EditorSession } from "./session";
import type { PointerInput } from "./session";

/**
 * Property tests for the editor: thousands of random actions, with a plain "list of snapshots" model checked against
 * the real session after every step. If undo / redo / reset ever disagrees with the model, a seed number pins it down.
 */

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = ["#ffffff", "#111111", "#c0392b", "#2a6fdb", "#e0a526", "#2e8b57"].map(pal);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A chart made of overlapping rectangles, so fills meet real region shapes. */
function randomChart(cols: number, rows: number, rand: () => number, colors = PALETTE.length): StitchMatrix {
  const cells = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const blocks = 6 + Math.floor(rand() * 10);
  for (let b = 0; b < blocks; b++) {
    const c0 = Math.floor(rand() * cols);
    const r0 = Math.floor(rand() * rows);
    const w = 1 + Math.floor(rand() * (cols / 2));
    const h = 1 + Math.floor(rand() * (rows / 2));
    const v = Math.floor(rand() * colors);
    for (let r = r0; r < Math.min(rows, r0 + h); r++) for (let c = c0; c < Math.min(cols, c0 + w); c++) cells[r][c] = v;
  }
  return { cols, rows, palette: PALETTE.slice(0, colors), cells };
}

const CELL = 10;
const snap = (m: StitchMatrix) => m.cells.map((r) => r.join("")).join("/");

class Harness {
  readonly s: EditorSession;
  readonly converted: StitchMatrix;
  readonly convertedSnap: string;
  /** Model of the undo stack: snapshot of the chart after each committed action, starting with the converted chart. */
  done: string[];
  redo: string[] = [];
  constructor(converted: StitchMatrix, private rand: () => number) {
    this.converted = converted;
    this.convertedSnap = snap(converted);
    this.s = new EditorSession(converted);
    this.done = [this.convertedSnap];
  }
  private at = (x: number, y: number): Stitch | null => {
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    return x < 0 || y < 0 || col >= this.converted.cols || row >= this.converted.rows ? null : { col, row };
  };
  private pt = (c: number, r: number) => [c * CELL + 5, r * CELL + 5] as const;
  private send(i: PointerInput) {
    return this.s.handle(i, this.at);
  }
  private randCol() {
    return Math.floor(this.rand() * this.converted.cols);
  }
  private randRow() {
    return Math.floor(this.rand() * this.converted.rows);
  }
  private committed(effects: ReturnType<EditorSession["handle"]>) {
    return effects.some((e) => e.type === "committed");
  }
  private record(effects: ReturnType<EditorSession["handle"]>) {
    if (this.committed(effects)) {
      this.done.push(snap(this.s.matrix));
      this.redo = [];
    }
  }

  stroke() {
    this.s.tool = "paint";
    this.s.mode = "draw";
    this.s.setActive(Math.floor(this.rand() * this.converted.palette.length));
    const [x, y] = this.pt(this.randCol(), this.randRow());
    let out = this.send({ type: "down", id: 1, kind: "mouse", x, y, button: 0 });
    let c = Math.floor(x / CELL);
    let r = Math.floor(y / CELL);
    const steps = 1 + Math.floor(this.rand() * 25);
    for (let k = 0; k < steps; k++) {
      c += Math.floor(this.rand() * 9) - 4; // sometimes leaves the chart
      r += Math.floor(this.rand() * 9) - 4;
      const [mx, my] = this.pt(c, r);
      out = out.concat(this.send({ type: "move", id: 1, x: mx, y: my }));
    }
    out = out.concat(this.send({ type: "up", id: 1 }));
    this.record(out);
  }
  fill() {
    this.s.tool = "fill";
    this.s.mode = "draw";
    this.s.setActive(Math.floor(this.rand() * this.converted.palette.length));
    const [x, y] = this.pt(this.randCol(), this.randRow());
    let out = this.send({ type: "down", id: 1, kind: "touch", x, y, button: 0 });
    out = out.concat(this.send({ type: "up", id: 1 }));
    this.record(out);
  }
  cancelledStroke() {
    this.s.tool = "paint";
    this.s.mode = "draw";
    this.s.setActive(Math.floor(this.rand() * this.converted.palette.length));
    const before = snap(this.s.matrix);
    const [x, y] = this.pt(this.randCol(), this.randRow());
    this.send({ type: "down", id: 1, kind: "touch", x, y, button: 0 });
    this.send({ type: "move", id: 1, x: x + 30, y: y + 20 });
    this.send({ type: "cancel", id: 1 });
    expect(snap(this.s.matrix)).toBe(before);
  }
  pick() {
    this.s.tool = "pick";
    const before = snap(this.s.matrix);
    const [x, y] = this.pt(this.randCol(), this.randRow());
    this.send({ type: "down", id: 1, kind: "mouse", x, y, button: 0 });
    this.send({ type: "up", id: 1 });
    expect(snap(this.s.matrix)).toBe(before); // picking never edits
  }
  undo() {
    const can = this.done.length > 1;
    expect(this.s.canUndo).toBe(can);
    this.s.undo();
    if (can) this.redo.push(this.done.pop() as string);
  }
  redoStep() {
    const can = this.redo.length > 0;
    expect(this.s.canRedo).toBe(can);
    this.s.redo();
    if (can) this.done.push(this.redo.pop() as string);
  }
  check(spec: ReturnType<typeof buildGridSpec>) {
    expect(snap(this.s.matrix)).toBe(this.done[this.done.length - 1]);
    expect(snap(this.s.converted)).toBe(this.convertedSnap); // the converted chart is never touched
    expect(this.s.matrix.palette).toBe(this.converted.palette); // the palette never grows or changes
    expect(this.s.changedCount()).toBe(diff(this.s.matrix, this.converted));
    if (spec) expect(validateMatrix(this.s.matrix, { ...spec, maxColors: 10 })).toEqual([]);
  }
}

function diff(a: StitchMatrix, b: StitchMatrix): number {
  let n = 0;
  for (let r = 0; r < a.rows; r++) for (let c = 0; c < a.cols; c++) if (a.cells[r][c] !== b.cells[r][c]) n++;
  return n;
}

function run(seed: number, cols: number, rows: number, ops: number) {
  const rand = rng(seed);
  const converted = randomChart(cols, rows, rand);
  const h = new Harness(converted, rand);
  const spec = { ...buildGridSpec({ orientation: "portrait", sizeId: "6x8", maxColors: 10 }), cols, rows };
  for (let i = 0; i < ops; i++) {
    const p = rand();
    if (p < 0.3) h.stroke();
    else if (p < 0.5) h.fill();
    else if (p < 0.55) h.cancelledStroke();
    else if (p < 0.6) h.pick();
    else if (p < 0.8) h.undo();
    else h.redoStep();
    h.check(spec);
  }
  return h;
}

describe("random editing sessions agree with a simple snapshot model", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`seed ${seed}: 250 mixed actions on a 30 x 40 chart`, () => {
      const h = run(seed, 30, 40, 250);
      // Walk all the way back: every step must land on the snapshot the model remembers.
      while (h.done.length > 1) {
        h.undo();
        expect(snap(h.s.matrix)).toBe(h.done[h.done.length - 1]);
      }
      expect(snap(h.s.matrix)).toBe(h.convertedSnap); // undo everything = exactly the converted chart
      expect(h.s.changedCount()).toBe(0);
      // And all the way forward again.
      while (h.redo.length > 0) {
        h.redoStep();
        expect(snap(h.s.matrix)).toBe(h.done[h.done.length - 1]);
      }
    });
  }

  it("a new action after undoing ends the redo chain", () => {
    const rand = rng(99);
    const h = new Harness(randomChart(20, 20, rand), rand);
    for (let i = 0; i < 6; i++) h.fill();
    h.undo();
    h.undo();
    expect(h.s.canRedo).toBe(true);
    h.stroke();
    if (h.done.length > 4) expect(h.s.canRedo).toBe(false);
  });

  it("reset returns to the converted chart exactly and clears history", () => {
    const rand = rng(7);
    const h = run(7, 24, 32, 120);
    h.s.reset();
    expect(snap(h.s.matrix)).toBe(h.convertedSnap);
    expect(h.s.canUndo).toBe(false);
    expect(h.s.canRedo).toBe(false);
    expect(h.s.changedCount()).toBe(0);
    void rand;
  });
});

describe("history limits keep the undo chain consistent", () => {
  it("more than the action limit: only the newest actions can be undone, and each lands on the right snapshot", () => {
    const rand = rng(2024);
    const converted = randomChart(20, 20, rand);
    const h = new Harness(converted, rand);
    const N = HISTORY_LIMITS.maxActions + 60;
    let made = 0;
    while (made < N) {
      const before = h.done.length;
      h.stroke();
      if (h.done.length > before) made++;
    }
    const snaps = [...h.done]; // snapshots[0] is the converted chart, snapshots[N] is now
    let steps = 0;
    while (h.s.canUndo) {
      h.s.undo();
      steps++;
      expect(snap(h.s.matrix)).toBe(snaps[snaps.length - 1 - steps]);
    }
    expect(steps).toBe(HISTORY_LIMITS.maxActions);
  });

  it("whole-chart fills respect the stitch budget: the oldest go first, the chain stays exact", () => {
    const rand = rng(31);
    const cols = 96;
    const rows = 144; // the largest chart
    const converted = randomChart(cols, rows, rand);
    const h = new Harness(converted, rand);
    // Alternate whole-chart fills: every one changes (almost) every stitch.
    const fills = 140;
    const sizes: number[] = []; // stitches changed by each committed fill, oldest first
    for (let i = 0; i < fills; i++) {
      h.s.tool = "fill";
      h.s.setActive(i % 2 === 0 ? 1 : 0);
      h.s.handle({ type: "down", id: 1, kind: "mouse", x: 5, y: 5, button: 0 }, (x, y) => ({ col: Math.floor(x / CELL), row: Math.floor(y / CELL) }));
      const out = h.s.handle({ type: "up", id: 1 }, () => ({ col: 0, row: 0 }));
      const c = out.find((e) => e.type === "committed");
      if (c && c.type === "committed") {
        h.done.push(snap(h.s.matrix));
        sizes.push(c.stitches);
      }
    }
    const snaps = [...h.done];
    let steps = 0;
    while (h.s.canUndo) {
      h.s.undo();
      steps++;
      expect(snap(h.s.matrix)).toBe(snaps[snaps.length - 1 - steps]);
    }
    expect(steps).toBeLessThan(snaps.length - 1); // the budget really did trim something
    // ...and exactly as much as the rule says: the newest actions whose total stays within the budget (at least one is kept).
    let total = 0;
    let expected = 0;
    for (let i = sizes.length - 1; i >= 0 && expected < HISTORY_LIMITS.maxActions; i--) {
      if (expected > 0 && total + sizes[i] > HISTORY_LIMITS.maxStitches) break;
      total += sizes[i];
      expected++;
    }
    expect(steps).toBe(expected);
    expect(steps).toBeGreaterThan(30);
    // redo walks all the way back to where we were
    while (h.s.canRedo) h.s.redo();
    expect(snap(h.s.matrix)).toBe(snaps[snaps.length - 1]);
  });
});
