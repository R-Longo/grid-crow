import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { buildGridSpec } from "../geometry";
import type { Stitch } from "./coords";
import { EditorSession } from "./session";

/**
 * How fast the editor's logic is on the LARGEST charts (24 x 32 in = 96 x 144 stitches, portrait or landscape).
 * The ceilings are deliberately generous (about 10x what a normal machine needs) so slow test machines do not fail,
 * but a real slowdown (something accidentally quadratic, a chart copied per stitch) still does. The measured numbers
 * are printed so they can be reported. Drawing speed on screen is measured in the real browser instead.
 */
const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = ["#ffffff", "#111111", "#c0392b", "#2a6fdb", "#e0a526", "#2e8b57", "#8e44ad", "#16a085", "#d35400", "#7f8c8d"].map(pal);

const CELL = 10;
function chart(cols: number, rows: number, kind: "blank" | "stripes" | "noise"): StitchMatrix {
  let seed = 12345;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, () => (kind === "blank" ? 0 : kind === "stripes" ? (r >> 2) % 10 : Math.floor(noise() * 10))),
  );
  return { cols, rows, palette: PALETTE, cells };
}
const time = (f: () => void) => {
  const t = performance.now();
  f();
  return performance.now() - t;
};
const SIZES = [
  { name: "24x32 portrait (96 x 144)", ...buildGridSpec({ orientation: "portrait", sizeId: "24x32", maxColors: 10 }) },
  { name: "24x32 landscape (128 x 108)", ...buildGridSpec({ orientation: "landscape", sizeId: "24x32", maxColors: 10 }) },
];

describe("largest charts: editing logic stays fast", () => {
  for (const size of SIZES) {
    it(size.name, () => {
      const { cols, rows } = size;
      const at = (x: number, y: number): Stitch | null => {
        const col = Math.floor(x / CELL);
        const row = Math.floor(y / CELL);
        return x < 0 || y < 0 || col >= cols || row >= rows ? null : { col, row };
      };
      const out: Record<string, number> = {};

      // 1. A long scribble: one stroke with 3000 pointer moves across the whole chart.
      {
        const s = new EditorSession(chart(cols, rows, "noise"));
        s.setActive(3);
        s.handle({ type: "down", id: 1, kind: "mouse", x: 5, y: 5, button: 0 }, at);
        out["stroke: 3000 pointer moves (ms)"] = time(() => {
          for (let i = 0; i < 3000; i++) {
            const x = ((i * 37) % (cols * CELL)) + 5;
            const y = ((i * 53) % (rows * CELL)) + 5;
            s.handle({ type: "move", id: 1, x, y }, at);
          }
        });
        out["stroke: release + commit (ms)"] = time(() => void s.handle({ type: "up", id: 1 }, at));
        out["undo that stroke (ms)"] = time(() => void s.undo());
        out["redo it (ms)"] = time(() => void s.redo());
      }

      // 2. Fill the whole chart (one connected region of 13,824 stitches), undo, redo.
      {
        const s = new EditorSession(chart(cols, rows, "blank"));
        s.tool = "fill";
        s.setActive(5);
        s.handle({ type: "down", id: 1, kind: "mouse", x: 5, y: 5, button: 0 }, at);
        out["fill every stitch (ms)"] = time(() => void s.handle({ type: "up", id: 1 }, () => ({ col: 0, row: 0 })));
        expect(s.changedCount()).toBe(cols * rows);
        out["undo the fill (ms)"] = time(() => void s.undo());
        out["redo the fill (ms)"] = time(() => void s.redo());
        out["count changed stitches (ms)"] = time(() => void s.changedCount());
      }

      // 3. Worst case for flood fill: a checkerboard-ish chart (many tiny regions) and a snake-shaped region.
      {
        const snake = chart(cols, rows, "blank");
        for (let r = 1; r < rows; r += 2) for (let c = 0; c < cols - (r % 4 === 1 ? 1 : 0); c++) if (!(r % 4 === 1 && c === cols - 1) && !(r % 4 === 3 && c === 0)) snake.cells[r][c] = 1;
        const s = new EditorSession(snake);
        s.tool = "fill";
        s.setActive(2);
        s.handle({ type: "down", id: 1, kind: "mouse", x: 5, y: 5, button: 0 }, at);
        out["fill a snake-shaped region (ms)"] = time(() => void s.handle({ type: "up", id: 1 }, () => ({ col: 0, row: 0 })));
      }

      // 4. 500 actions in a row, then undo all of them.
      {
        const s = new EditorSession(chart(cols, rows, "stripes"));
        let n = 0;
        out["500 strokes + fills (ms)"] = time(() => {
          for (let i = 0; i < 500; i++) {
            s.tool = i % 5 === 0 ? "fill" : "paint";
            s.setActive(i % 10);
            const x = ((i * 91) % (cols * CELL)) + 5;
            const y = ((i * 47) % (rows * CELL)) + 5;
            s.handle({ type: "down", id: 1, kind: "mouse", x, y, button: 0 }, at);
            if (s.tool === "paint") for (let k = 1; k < 8; k++) s.handle({ type: "move", id: 1, x: x + k * 6, y: y + k * 3 }, at);
            const e = s.handle({ type: "up", id: 1 }, at);
            if (e.some((x) => x.type === "committed")) n++;
          }
        });
        out["undo all of them (ms)"] = time(() => {
          while (s.canUndo) s.undo();
        });
        expect(s.changedCount()).toBe(0);
        out["(actions recorded)"] = n;
      }

      // eslint-disable-next-line no-console
      console.log(`\n${size.name}\n` + Object.entries(out).map(([k, v]) => `  ${k.padEnd(36)} ${typeof v === "number" && !k.startsWith("(") ? v.toFixed(2) : v}`).join("\n"));

      // Generous ceilings (ms). Normal machines use a small fraction of these.
      expect(out["stroke: 3000 pointer moves (ms)"]).toBeLessThan(1500);
      expect(out["fill every stitch (ms)"]).toBeLessThan(500);
      expect(out["undo the fill (ms)"]).toBeLessThan(300);
      expect(out["redo the fill (ms)"]).toBeLessThan(300);
      expect(out["fill a snake-shaped region (ms)"]).toBeLessThan(500);
      expect(out["500 strokes + fills (ms)"]).toBeLessThan(5000);
      expect(out["undo all of them (ms)"]).toBeLessThan(2000);
    });
  }
});
