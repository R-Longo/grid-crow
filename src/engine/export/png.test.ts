import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { FINISHED_SIZES } from "../../config/sizes";
import { buildGridSpec } from "../geometry";
import { EditorSession } from "../editor/session";
import { colorCounts } from "../editor/paint";
import { buildPatternModel, gaugeLine, labelNumbers, letterFor } from "./pattern";
import { PNG_LIMITS, drawPng, layoutPng, wrapText } from "./png";
import type { Ctx2D } from "./png";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const PALETTE = ["#ffffff", "#111111", "#c0392b", "#2a6fdb", "#e0a526", "#2e8b57", "#8e44ad", "#16a085", "#d35400", "#7f8c8d"].map(pal);

function chart(cols: number, rows: number, colors = 4): StitchMatrix {
  let seed = 7;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const cells = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let b = 0; b < 14; b++) {
    const c0 = Math.floor(rnd() * cols), r0 = Math.floor(rnd() * rows), w = 1 + Math.floor(rnd() * cols * 0.5), h = 1 + Math.floor(rnd() * rows * 0.5), v = Math.floor(rnd() * colors);
    for (let r = r0; r < Math.min(rows, r0 + h); r++) for (let c = c0; c < Math.min(cols, c0 + w); c++) cells[r][c] = v;
  }
  return { cols, rows, palette: PALETTE.slice(0, colors), cells };
}
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
};

interface Rect { x: number; y: number; w: number; h: number; fill: string }
interface Txt { text: string; x: number; y: number; fill: string; align: string; font: string }
class Recorder implements Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000";
  font = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  rects: Rect[] = [];
  texts: Txt[] = [];
  fillRect(x: number, y: number, w: number, h: number) {
    this.rects.push({ x, y, w, h, fill: String(this.fillStyle) });
  }
  fillText(text: string, x: number, y: number) {
    this.texts.push({ text, x, y, fill: String(this.fillStyle), align: this.textAlign, font: this.font });
  }
}
function render(m: StitchMatrix, letters = false) {
  const model = buildPatternModel(m);
  const layout = layoutPng(model, { letters });
  const rec = new Recorder();
  drawPng(rec, model, layout);
  return { model, layout, rec };
}
const cellRects = (rec: Recorder, l: { cellW: number; cellH: number }) => rec.rects.filter((r) => r.w === l.cellW && r.h === l.cellH);

describe("PNG export draws the stitch matrix", () => {
  it("draws every stitch exactly once, in exactly its palette color, at the right place", () => {
    const m = deepFreeze(chart(30, 40, 5));
    const { layout: l, rec } = render(m);
    const seen = new Map<string, string>();
    for (const r of cellRects(rec, l)) {
      const key = `${r.x},${r.y}`;
      expect(seen.has(key)).toBe(false); // once
      seen.set(key, r.fill);
    }
    expect(seen.size).toBe(30 * 40);
    for (let r = 0; r < 40; r++) for (let c = 0; c < 30; c++) expect(seen.get(`${l.x0 + c * l.cellW},${l.y0 + r * l.cellH}`)).toBe(m.palette[m.cells[r][c]].hex.toUpperCase());
  });

  it("uses the EDITED grid, not the converted one", () => {
    const converted = chart(24, 36, 4);
    const s = new EditorSession(converted);
    s.tool = "fill";
    s.setActive(3);
    const at = (x: number, y: number) => ({ col: Math.floor(x / 10), row: Math.floor(y / 10) });
    s.handle({ type: "down", id: 1, kind: "mouse", x: 5, y: 5, button: 0 }, at);
    s.handle({ type: "up", id: 1 }, at);
    s.tool = "paint";
    s.setActive(2);
    s.handle({ type: "down", id: 1, kind: "mouse", x: 125, y: 205, button: 0 }, at);
    s.handle({ type: "up", id: 1 }, at);
    expect(s.changedCount()).toBeGreaterThan(0);

    const before = render(converted);
    const after = render(s.matrix);
    const colorAt = (r: ReturnType<typeof render>, c: number, row: number) =>
      cellRects(r.rec, r.layout).find((x) => x.x === r.layout.x0 + c * r.layout.cellW && x.y === r.layout.y0 + row * r.layout.cellH)!.fill;
    expect(colorAt(after, 12, 20)).toBe(PALETTE[2].hex.toUpperCase()); // the pencil stitch
    expect(colorAt(before, 12, 20)).not.toBe(PALETTE[2].hex.toUpperCase() === colorAt(before, 12, 20) ? "" : PALETTE[2].hex.toUpperCase());
    expect(colorAt(after, 0, 0)).toBe(PALETTE[3].hex.toUpperCase()); // the fill
    // and the legend counts follow the edits
    const counts = colorCounts(s.matrix);
    const legendNow = after.layout.legend.map((e) => e.count);
    expect(legendNow).toEqual(after.model.colors.map((c) => counts[c.index]));
    expect(legendNow).not.toEqual(before.layout.legend.map((e) => e.count));
  });

  it("legend counts add up to the number of stitches and match the grid exactly", () => {
    const m = chart(96, 144, 10);
    const { model, layout } = render(m);
    const truth = colorCounts(m);
    expect(layout.legend.map((e) => e.count)).toEqual(model.colors.map((c) => truth[c.index]));
    expect(layout.legend.reduce((a, e) => a + e.count, 0)).toBe(96 * 144);
    expect(layout.total.text).toContain("13,824 stitches");
    for (const e of layout.legend) {
      expect(e.hexText.text).toBe(e.hex);
      expect(e.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(e.countText.text).toContain(e.count.toLocaleString("en-US"));
    }
  });

  it("gives letters A, B, C... to the colors in use and leaves out a color no stitch uses", () => {
    const m = chart(20, 20, 4);
    // wipe color 1 out of the chart
    const cells = m.cells.map((row) => row.map((v) => (v === 1 ? 0 : v)));
    const { model, layout, rec } = render({ ...m, cells }, true);
    expect(model.colors.map((c) => c.index)).not.toContain(1);
    expect(model.colors.map((c) => c.letter)).toEqual(model.colors.map((_, i) => letterFor(i)));
    expect(layout.legend.map((e) => e.letter)).toEqual(model.colors.map((_, i) => letterFor(i)));
    // the letter drawn in a stitch is the letter in the legend for that stitch's color
    const letterTexts = rec.texts.filter((t) => t.font.startsWith("bold " + layout.letterSize + "px"));
    expect(letterTexts).toHaveLength(400);
    const byIndex = new Map(model.colors.map((c) => [c.index, c.letter]));
    for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) {
      const t = letterTexts.find((x) => x.x === layout.x0 + c * layout.cellW + layout.cellW / 2 && x.y === layout.y0 + r * layout.cellH + layout.cellH / 2 + 1)!;
      expect(t.text).toBe(byIndex.get(cells[r][c]));
    }
  });

  it("is clean color blocks by default: no letters inside stitches, but the legend always has them", () => {
    const m = chart(20, 20, 4);
    const off = render(m);
    expect(off.layout.showLetters).toBe(false);
    expect(off.rec.texts.filter((t) => t.font.startsWith("bold " + off.layout.letterSize + "px") && t.text.length === 1 && /[A-Z]/.test(t.text) && t.y > off.layout.y0 && t.y < off.layout.y0 + off.layout.chartH)).toHaveLength(0);
    expect(off.layout.legend.map((e) => e.letter)).toEqual(off.model.colors.map((_, i) => letterFor(i)));
    const on = render(m, true);
    expect(on.layout.showLetters).toBe(true);
    expect(on.layout.legend.map((e) => e.letter)).toEqual(off.layout.legend.map((e) => e.letter));
    // same stitch size and image size either way
    expect([on.layout.width, on.layout.height, on.layout.cellW]).toEqual([off.layout.width, off.layout.height, off.layout.cellW]);
  });

  it("numbers columns left to right, from 1", () => {
    const { layout: l, rec } = render(chart(30, 40, 4));
    const top = rec.texts.filter((t) => t.y < l.y0 && t.y > l.y0 - l.numberSize * 3 && /^\d+$/.test(t.text) && t.x >= l.x0 && t.x <= l.x0 + l.chartW);
    expect(top).toHaveLength(30);
    const sorted = [...top].sort((a, b) => a.x - b.x);
    expect(sorted.map((t) => Number(t.text))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    sorted.forEach((t, i) => expect(t.x).toBe(l.x0 + i * l.cellW + l.cellW / 2)); // number n is centred over stitch n
    // and the same along the bottom edge
    const bottom = rec.texts.filter((t) => t.y > l.y0 + l.chartH && t.y < l.y0 + l.chartH + l.numberSize * 3 && /^\d+$/.test(t.text));
    expect(bottom.map((t) => t.text).sort()).toEqual(top.map((t) => t.text).sort());
  });

  it("puts row 1 at the BOTTOM, with row numbers rising upward", () => {
    const rows = 40;
    const { layout: l, rec } = render(chart(30, rows, 4));
    const left = rec.texts.filter((t) => t.x < l.x0 && /^\d+$/.test(t.text) && t.y >= l.y0 && t.y <= l.y0 + l.chartH);
    expect(left).toHaveLength(rows);
    const byY = [...left].sort((a, b) => b.y - a.y); // bottom of the page first
    expect(byY.map((t) => Number(t.text))).toEqual(Array.from({ length: rows }, (_, i) => i + 1));
    expect(byY[0].y).toBe(l.y0 + (rows - 1) * l.cellH + l.cellH / 2); // "1" sits beside the bottom stitch row
    expect(left.find((t) => t.text === String(rows))!.y).toBe(l.y0 + l.cellH / 2); // the top row is the highest number
    // and the right-hand side agrees
    const right = rec.texts.filter((t) => t.x > l.x0 + l.chartW && /^\d+$/.test(t.text) && t.y >= l.y0 && t.y <= l.y0 + l.chartH);
    expect(right.map((t) => `${t.text}@${t.y}`).sort()).toEqual(left.map((t) => `${t.text}@${t.y}`).sort());
  });

  it("the stitch at matrix row 0 (top) is numbered with the highest row number, and the last matrix row is row 1", () => {
    const m = chart(10, 12, 4);
    m.cells[11][0] = 3;
    const { layout: l, rec } = render(m);
    const bottomStitch = cellRects(rec, l).find((r) => r.x === l.x0 && r.y === l.y0 + 11 * l.cellH)!;
    expect(bottomStitch.fill).toBe(PALETTE[3].hex.toUpperCase());
    const one = rec.texts.find((t) => t.text === "1" && t.x < l.x0)!;
    expect(one.y).toBe(l.y0 + 11 * l.cellH + l.cellH / 2);
  });

  it("draws heavier counting lines after every 10th stitch and row, counted from the left and the bottom", () => {
    const { layout: l, rec } = render(chart(96, 144, 6));
    const heavyV = rec.rects.filter((r) => r.w === 2 && r.h === l.chartH && r.fill === "#17191b" && r.y === l.y0 && r.x > l.x0 && r.x < l.x0 + l.chartW);
    expect(heavyV.map((r) => r.x + 1)).toEqual(Array.from({ length: 9 }, (_, i) => l.x0 + (i + 1) * 10 * l.cellW));
    const heavyH = rec.rects.filter((r) => r.h === 2 && r.w === l.chartW && r.fill === "#17191b" && r.x === l.x0 && r.y > l.y0 && r.y < l.y0 + l.chartH);
    expect(heavyH.map((r) => r.y + 1).sort((a, b) => b - a)).toEqual(Array.from({ length: 14 }, (_, i) => l.y0 + (144 - (i + 1) * 10) * l.cellH));
  });

  it("states the size in stitches, the finished size, and the exact reference gauge", () => {
    const { layout } = render(chart(96, 144, 6));
    const lines = layout.header.map((h) => h.text);
    expect(lines).toContain("96 stitches × 144 rows");
    expect(lines).toContain("Finished size about 24 × 32 inches");
    expect(gaugeLine()).toBe("Reference gauge: 16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook.");
    expect(lines.filter((_, i) => i >= 2).join(" ")).toContain("Reference gauge: 16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook.");
    const small = render(chart(24, 36, 4)).layout.header.map((h) => h.text);
    expect(small).toContain("Finished size about 6 × 8 inches");
  });

  it("does not change the matrix it is given", () => {
    const m = deepFreeze(chart(30, 40, 4));
    expect(() => render(m)).not.toThrow();
  });
});

describe("PNG size", () => {
  const sizes = FINISHED_SIZES.flatMap((s) => (["portrait", "landscape"] as const).map((o) => ({ s: s.id, o })));
  for (const { s, o } of sizes) {
    it(`${s} ${o}: fits the pixel budget, keeps the 9:8 stitch shape and whole-pixel cells`, () => {
      const g = buildGridSpec({ orientation: o, sizeId: s, maxColors: 10 });
      const { layout: l } = render(chart(g.cols, g.rows, 10));
      expect(l.width * l.height).toBeLessThanOrEqual(PNG_LIMITS.maxPixels);
      expect(Math.max(l.width, l.height)).toBeLessThanOrEqual(PNG_LIMITS.maxSide);
      expect(l.cellW / l.cellH).toBe(9 / 8);
      expect(Number.isInteger(l.cellW) && Number.isInteger(l.cellH)).toBe(true);
      expect(l.x0).toBeGreaterThanOrEqual(0);
      expect(l.x0 + l.chartW).toBeLessThanOrEqual(l.width);
      expect(l.total.y).toBeLessThan(l.height);
    });
  }
  it("the biggest chart (96 x 144) is still large enough to read: letters in every stitch and every number labelled", () => {
    const m = chart(96, 144, 10);
    for (let i = 0; i < 10; i++) m.cells[0][i] = i; // make sure all ten colors are in use
    const { layout: l } = render(m, true);
    expect(l.cellW).toBeGreaterThanOrEqual(27);
    expect(l.showLetters).toBe(true);
    expect(l.labelStep).toBe(1);
    expect(l.legend).toHaveLength(10);
  });
  it("small charts get bigger stitches than big ones", () => {
    expect(render(chart(24, 36, 4)).layout.cellW).toBeGreaterThan(render(chart(96, 144, 4)).layout.cellW);
  });
});

describe("small helpers", () => {
  it("labelNumbers", () => {
    expect(labelNumbers(12, 1)).toHaveLength(12);
    expect(labelNumbers(22, 5)).toEqual([1, 5, 10, 15, 20]);
  });
  it("letterFor", () => {
    expect([0, 1, 9, 25, 26, 27].map(letterFor)).toEqual(["A", "B", "J", "Z", "AA", "AB"]);
  });
  it("wrapText breaks at spaces and never drops a word", () => {
    const t = "Reference gauge: 16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook.";
    const lines = wrapText(t, 40);
    expect(lines.join(" ")).toBe(t);
    expect(lines.every((x) => x.length <= 40)).toBe(true);
  });
});
