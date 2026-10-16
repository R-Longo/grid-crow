import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../../convert/types";
import { FINISHED_SIZES } from "../../../config/sizes";
import { buildGridSpec } from "../../geometry";
import { buildPatternModel, gaugeLine, letterFor } from "../pattern";
import type { PatternModel } from "../pattern";
import { opBox } from "./bounds";
import { INK } from "./chart";
import { buildPdf, buildPdfDoc } from "./index";
import { textWidth, wrapToWidth } from "./metrics";
import type { Op, PdfPage, RectOp, TextOp, LineOp } from "./ops";
import { LETTER } from "./ops";
import { TILE_CELL_H, TILE_CELL_W, TILE_MAX_COLS, TILE_MAX_ROWS, tilePlanFor } from "./tiled";
import { evenSplit, planTiles } from "./tiles";
import { pdfString } from "./writer";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const HEX = ["#ffffff", "#111111", "#c0392b", "#2a6fdb", "#e0a526", "#2e8b57", "#8e44ad", "#16a085", "#d35400", "#7f8c8d"];
const PALETTE = HEX.map(pal);

/** A chart in which neighbouring stitches almost always differ, so a stitch in the wrong place always shows. */
function chart(cols: number, rows: number, colors = 6): StitchMatrix {
  let seed = 11;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => Math.floor(rnd() * colors)));
  for (let i = 0; i < colors; i++) cells[0][i % cols] = i; // every color in use
  return { cols, rows, palette: PALETTE.slice(0, colors), cells };
}
const model = (cols: number, rows: number, colors = 6) => buildPatternModel(chart(cols, rows, colors));

const rects = (p: PdfPage, tag: string) => p.ops.filter((o): o is RectOp => o.k === "rect" && o.tag === tag);
const lines = (p: PdfPage, tag: string) => p.ops.filter((o): o is LineOp => o.k === "line" && o.tag === tag);
const texts = (p: PdfPage, tag: string) => p.ops.filter((o): o is TextOp => o.k === "text" && o.tag === tag);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

interface Cell { col: number; rowNum: number; fill: string; cx: number; cy: number }

/** Read the stitches back off a tiled page using only what is printed on it: the stitch rectangles and the column and row numbers. */
function decodeByNumbers(p: PdfPage, cellW: number, cellH: number, numberSize = 7): Cell[] {
  const colAt = new Map<number, number>();
  for (const t of texts(p, "label-col-top")) colAt.set(Math.round(t.x * 1000), Number(t.s));
  const rowAt = new Map<number, number>();
  for (const t of texts(p, "label-row-left")) rowAt.set(Math.round((t.y - numberSize * 0.36) * 1000), Number(t.s));
  const out: Cell[] = [];
  for (const r of rects(p, "stitch")) {
    const n = Math.round(r.w / cellW);
    expect(near(r.w, n * cellW)).toBe(true); // a run is a whole number of stitches
    expect(near(r.h, cellH)).toBe(true);
    for (let i = 0; i < n; i++) {
      const cx = r.x + (i + 0.5) * cellW;
      const cy = r.y + cellH / 2;
      const col = colAt.get(Math.round(cx * 1000));
      const rowNum = rowAt.get(Math.round(cy * 1000));
      expect(col, `a column number is printed over the stitch at x=${cx}`).toBeDefined();
      expect(rowNum, `a row number is printed beside the stitch at y=${cy}`).toBeDefined();
      out.push({ col: col as number, rowNum: rowNum as number, fill: r.fill, cx, cy });
    }
  }
  return out;
}

const tilePages = (pages: PdfPage[]) => pages.filter((p) => p.meta?.kind === "tile");
const fillAt = (m: PatternModel, col: number, rowNum: number) => m.hexOf[m.matrix.cells[m.rows - rowNum][m.cols - col]];

describe("PDF writer", () => {
  it("writes a well-formed file: header, objects at the offsets the table says, page count, trailer", () => {
    const bytes = buildPdf(model(30, 40), { layout: "tiled", letters: true });
    const s = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
    expect(s.startsWith("%PDF-1.4\n")).toBe(true);
    expect(s.endsWith("%%EOF\n")).toBe(true);
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe("xref");
    const count = Number(/xref\n0 (\d+)\n/.exec(s.slice(start))![1]);
    const entries = [...s.slice(start).matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
    expect(entries).toHaveLength(count);
    entries.slice(1).forEach((e, i) => expect(s.slice(Number(e[1])).startsWith(`${i + 1} 0 obj\n`)).toBe(true));
    // every content stream's /Length is its real length
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) expect(m[2].length).toBe(Number(m[1]));
    expect(Number(/\/Count (\d+)/.exec(s)![1])).toBe(buildPdfDoc(model(30, 40), { layout: "tiled", letters: true }).pages.length);
    expect(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(s)).toBe(true); // plain ASCII
  });
  it("is deterministic: the same chart gives the same bytes", () => {
    const a = buildPdf(model(40, 50), { layout: "tiled", letters: true });
    const b = buildPdf(model(40, 50), { layout: "tiled", letters: true });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
  it("escapes text safely", () => {
    expect(pdfString("a (b) \\ c")).toBe("(a \\(b\\) \\\\ c)");
    expect(pdfString("3 × 4 – 5")).toBe("(3 \\327 4 \\226 5)");
  });
  it("measures text with the Helvetica widths", () => {
    expect(textWidth("A", 1000)).toBe(667);
    expect(textWidth("A", 1000, true)).toBe(722);
    expect(textWidth("100", 10)).toBeCloseTo(16.68, 5);
    for (const l of wrapToWidth("the quick brown fox jumps over the lazy dog again and again", 10, 120)) expect(textWidth(l, 10)).toBeLessThanOrEqual(120);
  });
});

describe("Fit to Page", () => {
  const sizes = FINISHED_SIZES.flatMap((s) => (["portrait", "landscape"] as const).flatMap((o) => ([4, 10] as const).map((n) => ({ s: s.id, o, n }))));
  for (const { s, o, n } of sizes) {
    it(`${s} ${o} ${n} colors: nothing is clipped, stitches keep their 9:8 shape, every stitch is there once`, () => {
      const g = buildGridSpec({ orientation: o, sizeId: s, maxColors: n });
      const m = model(g.cols, g.rows, n);
      const pages = buildPdfDoc(m, { layout: "fit", letters: true }).pages;
      expect(pages.length).toBeLessThanOrEqual(2);
      for (const p of pages) {
        for (const op of p.ops) {
          const b = opBox(op);
          expect(b.x0).toBeGreaterThanOrEqual(30 - 1e-6);
          expect(b.y0).toBeGreaterThanOrEqual(30 - 1e-6);
          expect(b.x1).toBeLessThanOrEqual(p.width - 30 + 1e-6);
          expect(b.y1).toBeLessThanOrEqual(p.height - 30 + 1e-6);
        }
      }
      const chart = pages[0].meta!.chart as { x0: number; y0: number; cellW: number; cellH: number };
      expect(chart.cellW / chart.cellH).toBeCloseTo(9 / 8, 9);
      // every stitch exactly once, in its own color, at the place its numbers say
      const seen = new Set<string>();
      for (const r of rects(pages[0], "stitch")) {
        const k = Math.round(r.w / chart.cellW);
        const c0 = Math.round((r.x - chart.x0) / chart.cellW);
        const row = Math.round((r.y - chart.y0) / chart.cellH);
        for (let i = 0; i < k; i++) {
          const key = `${c0 + i},${row}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          expect(r.fill).toBe(m.hexOf[m.matrix.cells[row][c0 + i]]);
        }
      }
      expect(seen.size).toBe(g.cols * g.rows);
    });
  }

  it("the chart is as large as the page allows: 96 x 144 uses nearly the full page height", () => {
    const pages = buildPdfDoc(model(96, 144, 10), { layout: "fit", letters: true }).pages;
    const chart = pages[0].meta!.chart as { cellH: number };
    expect(chart.cellH * 144).toBeGreaterThan(600);
    expect(pages[0].width).toBe(LETTER.width);
  });

  it("puts the legend on a second page when the chart needs the whole first page, with exact counts", () => {
    const m = model(96, 144, 10);
    const pages = buildPdfDoc(m, { layout: "fit", letters: true }).pages;
    expect(pages).toHaveLength(2);
    expect(texts(pages[0], "legend-title")).toHaveLength(0);
    const p2 = pages[1];
    expect(texts(p2, "legend-title")).toHaveLength(1);
    expect(texts(p2, "legend-letter").map((t) => t.s)).toEqual(m.colors.map((_, i) => letterFor(i)));
    expect(texts(p2, "legend-hex").map((t) => t.s)).toEqual(m.colors.map((c) => c.hex));
    expect(texts(p2, "legend-count").map((t) => t.s)).toEqual(m.colors.map((c) => `${c.count.toLocaleString("en-US")} ${c.count === 1 ? "stitch" : "stitches"}`));
    expect(rects(p2, "legend-swatch").map((r) => r.fill)).toEqual(m.colors.map((c) => c.hex));
    expect(texts(p2, "legend-total")[0].s).toBe("Total: 13,824 stitches (96 × 144)");
    const all = texts(p2, "info").map((t) => t.s).join(" ");
    expect(all).toContain(gaugeLine());
    expect(all).toContain("Finished size about 24 × 32 inches");
  });

  it("keeps the legend on the same page when the chart is small enough, and turns the page to landscape for a wide chart", () => {
    const m = model(60, 24, 5);
    const pages = buildPdfDoc(m, { layout: "fit", letters: true }).pages;
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
    expect(texts(pages[0], "legend-count")).toHaveLength(5);
  });

  it("prints letters in stitches only when they are big enough to read, and says so when it leaves them out", () => {
    const big = buildPdfDoc(model(24, 36, 6), { layout: "fit", letters: true }).pages;
    expect(texts(big[0], "letter")).toHaveLength(24 * 36);
    const huge = buildPdfDoc(model(96, 144, 6), { layout: "fit", letters: true }).pages;
    expect(texts(huge[0], "letter")).toHaveLength(0);
    expect(huge.flatMap((p) => texts(p, "info")).map((t) => t.s).join(" ")).toContain("Letters are not printed");
    const off = buildPdfDoc(model(24, 36, 6), { layout: "fit", letters: false }).pages;
    expect(texts(off[0], "letter")).toHaveLength(0);
    expect(off.flatMap((p) => texts(p, "info")).map((t) => t.s).join(" ")).not.toContain("Letters are not printed");
  });

  it("numbers stitches from the RIGHT (stitch 1 at the right edge) and row 1 at the bottom", () => {
    const pages = buildPdfDoc(model(60, 90, 5), { layout: "fit", letters: false }).pages;
    const top = texts(pages[0], "label-col-top").sort((a, b) => a.x - b.x);
    expect(top.map((t) => Number(t.s))).toEqual([...top.map((t) => Number(t.s))].sort((a, b) => b - a));
    expect(top[top.length - 1].s).toBe("1");
    expect(top[0].s).toBe("60");
    const left = texts(pages[0], "label-row-left").sort((a, b) => a.y - b.y); // top of the page first
    expect(left.map((t) => Number(t.s))).toEqual([...left.map((t) => Number(t.s))].sort((a, b) => b - a));
    expect(left[left.length - 1].s).toBe("1");
  });
});

describe("tile plan", () => {
  it("splits at stitch boundaries into the fewest, most even parts", () => {
    expect(evenSplit(96, 27)).toEqual([24, 24, 24, 24]);
    expect(evenSplit(28, 27)).toEqual([14, 14]);
    expect(evenSplit(27, 27)).toEqual([27]);
    expect(evenSplit(100, 27)).toEqual([25, 25, 25, 25]);
    for (let total = 1; total <= 300; total++) {
      for (const max of [5, 27, 38]) {
        const parts = evenSplit(total, max);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts)).toBeLessThanOrEqual(max);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        expect(parts.length).toBe(Math.ceil(total / max));
      }
    }
  });
  it("covers every stitch exactly once, with neighbours that share an edge and nothing else", () => {
    for (const [cols, rows] of [[96, 144], [16, 18], [27, 38], [28, 39], [144, 96], [1, 1], [50, 7]]) {
      const plan = planTiles(cols, rows, 27, 38);
      const hits = new Uint8Array(cols * rows);
      for (const t of plan.tiles) for (let r = t.r0; r < t.r1; r++) for (let c = t.c0; c < t.c1; c++) hits[r * cols + c]++;
      expect(hits.every((h) => h === 1)).toBe(true);
      for (const t of plan.tiles) {
        const right = plan.tiles.find((u) => u.page === t.right);
        if (right) expect([right.c0, right.r0, right.r1]).toEqual([t.c1, t.r0, t.r1]);
        const below = plan.tiles.find((u) => u.page === t.bottom);
        if (below) expect([below.r0, below.c0, below.c1]).toEqual([t.r1, t.c0, t.c1]);
        expect(t.left === undefined).toBe(t.tc === 0);
        expect(t.top === undefined).toBe(t.tr === 0);
      }
    }
  });
});

describe("Large Print (tiled) PDF", () => {
  const m96 = model(96, 144, 10);
  const doc96 = buildPdfDoc(m96, { layout: "tiled", letters: true });
  const tiles96 = tilePages(doc96.pages);

  it("96 x 144 becomes an overview page plus 16 pages of 24 x 36 stitches at the real crochet size", () => {
    expect(doc96.pages).toHaveLength(17);
    expect(doc96.pages[0].meta!.kind).toBe("overview");
    expect(tiles96).toHaveLength(16);
    const plan = tilePlanFor(m96);
    expect(plan.colSizes).toEqual([24, 24, 24, 24]);
    expect(plan.rowSizes).toEqual([36, 36, 36, 36]);
    expect(TILE_CELL_W / TILE_CELL_H).toBe(9 / 8);
    // 18 x 16 points per stitch: 4 stitches and 4.5 rows to the inch
    expect(72 / TILE_CELL_W).toBe(4);
    expect(72 / TILE_CELL_H).toBe(4.5);
  });

  it("every stitch is printed on exactly one page, in its own color, at the global column and row its numbers say", () => {
    const seen = new Map<string, string>();
    for (const p of tiles96) {
      for (const c of decodeByNumbers(p, TILE_CELL_W, TILE_CELL_H)) {
        const key = `${c.col},${c.rowNum}`;
        expect(seen.has(key), `stitch ${key} appears twice`).toBe(false);
        seen.set(key, c.fill);
        expect(c.fill).toBe(fillAt(m96, c.col, c.rowNum));
      }
    }
    expect(seen.size).toBe(96 * 144);
  });

  it("covers every stitch exactly once for odd sizes too (a stitch is never dropped or doubled)", () => {
    for (const [cols, rows] of [[28, 39], [53, 77], [16, 18], [27, 38], [144, 96], [55, 100]]) {
      const m = model(cols, rows, 4);
      const seen = new Set<string>();
      for (const p of tilePages(buildPdfDoc(m, { layout: "tiled", letters: false }).pages)) {
        for (const c of decodeByNumbers(p, TILE_CELL_W, TILE_CELL_H)) {
          const key = `${c.col},${c.rowNum}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          expect(c.fill).toBe(fillAt(m, c.col, c.rowNum));
        }
      }
      expect(seen.size).toBe(cols * rows);
    }
  });

  it("keeps global numbering: no page restarts at 1 unless it is at the chart's left or bottom, and the ranges are printed", () => {
    for (const p of tiles96) {
      const t = p.meta!.tile as { c0: number; c1: number; r0: number; r1: number; page: number };
      const cols = texts(p, "label-col-top").map((x) => Number(x.s)).sort((a, b) => a - b);
      expect(cols[0]).toBe(96 - t.c1 + 1);
      expect(cols[cols.length - 1]).toBe(96 - t.c0);
      const rows = texts(p, "label-row-left").map((x) => Number(x.s)).sort((a, b) => a - b);
      expect(rows[0]).toBe(144 - t.r1 + 1);
      expect(rows[rows.length - 1]).toBe(144 - t.r0);
      expect(texts(p, "range")[0].s).toBe(`Columns ${96 - t.c1 + 1}–${96 - t.c0} of 96  ·  Rows ${144 - t.r1 + 1}–${144 - t.r0} of 144`);
      expect(texts(p, "page-id")[0].s).toBe(`Page ${t.page} of 17`);
    }
    // page 7 is the second down, second across: stitches 49-72 (counted from the right), rows 73-108
    expect(texts(doc96.pages[6], "range")[0].s).toContain("Columns 49–72 of 96");
    expect(texts(doc96.pages[6], "range")[0].s).toContain("Rows 73–108 of 144");
  });

  it("numbers stitches from the right and row 1 at the bottom on every page", () => {
    for (const p of tiles96) {
      const top = texts(p, "label-col-top").sort((a, b) => a.x - b.x).map((t) => Number(t.s));
      expect(top).toEqual([...top].sort((a, b) => b - a));
      const left = texts(p, "label-row-left").sort((a, b) => a.y - b.y).map((t) => Number(t.s));
      expect(left).toEqual([...left].sort((a, b) => b - a));
    }
    // page 17 is the bottom-right page: it holds row 1 at its bottom and stitch 1 at its right edge
    const last = doc96.pages[16];
    expect(texts(last, "label-row-left").sort((a, b) => b.y - a.y)[0].s).toBe("1");
    expect(texts(last, "label-col-top").sort((a, b) => b.x - a.x)[0].s).toBe("1");
    // and the top-left page starts at stitch 96, the far left
    expect(texts(doc96.pages[1], "label-col-top").sort((a, b) => a.x - b.x)[0].s).toBe("96");
  });

  it("adjacent pages share exactly one edge: bold line on both, same registration ticks, neighbouring stitches continue", () => {
    const plan = tilePlanFor(m96);
    const byPage = new Map(tiles96.map((p) => [(p.meta!.tile as { page: number }).page, p]));
    for (const t of plan.tiles) {
      const p = byPage.get(t.page)!;
      const chart = p.meta!.chart as { x0: number; y0: number; cellW: number; cellH: number };
      const W = (t.c1 - t.c0) * chart.cellW;
      const H = (t.r1 - t.r0) * chart.cellH;
      // bold alignment lines exist on joining edges only, and are much heavier than the grid
      const joins = lines(p, "join");
      const expected = [t.left, t.right, t.top, t.bottom].filter((v) => v !== undefined).length;
      expect(joins).toHaveLength(expected);
      for (const j of joins) {
        expect(j.w).toBeGreaterThanOrEqual(3);
        expect(j.color).toBe(INK);
      }
      expect(lines(p, "grid").every((g) => g.w <= 0.5)).toBe(true);
      expect(joins.some((j) => near(j.x1, chart.x0) && near(j.x2, chart.x0) && near(j.y2 - j.y1, H))).toBe(t.left !== undefined);
      expect(joins.some((j) => near(j.x1, chart.x0 + W) && near(j.x2, chart.x0 + W))).toBe(t.right !== undefined);
      expect(joins.some((j) => near(j.y1, chart.y0) && near(j.y2, chart.y0) && near(j.x2 - j.x1, W))).toBe(t.top !== undefined);
      expect(joins.some((j) => near(j.y1, chart.y0 + H))).toBe(t.bottom !== undefined);
      // the outer edges are plain borders, lighter than a joining edge
      expect(lines(p, "border")).toHaveLength(4 - expected);
      expect(lines(p, "border").every((b) => b.w < 3)).toBe(true);
    }

    const rowLineIds = (p: PdfPage, tag: string) => {
      // a tick sits on the line above row n: identify it by that n, from the row numbers printed on the page
      const centres = new Map(texts(p, "label-row-left").map((x) => [Math.round((x.y - 7 * 0.36 - TILE_CELL_H / 2) * 1000), Number(x.s)]));
      return lines(p, tag).map((l) => centres.get(Math.round(l.y1 * 1000))).sort((a, b) => (a as number) - (b as number));
    };
    const colLineIds = (p: PdfPage, tag: string) => {
      const lefts = new Map(texts(p, "label-col-top").map((x) => [Math.round((x.x - TILE_CELL_W / 2) * 1000), Number(x.s)]));
      return lines(p, tag).map((l) => lefts.get(Math.round(l.x1 * 1000))).sort((a, b) => (a as number) - (b as number));
    };
    for (const t of plan.tiles) {
      const a = byPage.get(t.page)!;
      if (t.right !== undefined) {
        const b = byPage.get(t.right)!;
        const ta = rowLineIds(a, "tick-right");
        const tb = rowLineIds(b, "tick-left");
        expect(ta.length).toBeGreaterThan(3);
        expect(ta.every((v) => v !== undefined)).toBe(true);
        expect(ta).toEqual(tb); // the same stitch lines on both pages
        expect(ta.every((n) => (n as number) % 5 === 0)).toBe(true);
        // stitch columns continue: the last column on A is one less than the first on B, over the same rows
        const ca = decodeByNumbers(a, TILE_CELL_W, TILE_CELL_H);
        const cb = decodeByNumbers(b, TILE_CELL_W, TILE_CELL_H);
        expect(Math.min(...ca.map((c) => c.col)) - 1).toBe(Math.max(...cb.map((c) => c.col))); // counting from the right, the page on the left holds the higher numbers
        expect([Math.min(...ca.map((c) => c.rowNum)), Math.max(...ca.map((c) => c.rowNum))]).toEqual([Math.min(...cb.map((c) => c.rowNum)), Math.max(...cb.map((c) => c.rowNum))]);
        // the joining edges are the same length
        const ja = lines(a, "join").find((j) => j.x1 === j.x2 && j.x1 > (a.meta!.chart as { x0: number }).x0 + 1)!;
        const jb = lines(b, "join").find((j) => j.x1 === j.x2 && near(j.x1, (b.meta!.chart as { x0: number }).x0))!;
        expect(ja.y2 - ja.y1).toBe(jb.y2 - jb.y1);
      }
      if (t.bottom !== undefined) {
        const b = byPage.get(t.bottom)!;
        const ta = colLineIds(a, "tick-bottom");
        const tb = colLineIds(b, "tick-top");
        expect(ta.length).toBeGreaterThan(3);
        expect(ta.every((v) => v !== undefined)).toBe(true);
        expect(ta).toEqual(tb);
        const ca = decodeByNumbers(a, TILE_CELL_W, TILE_CELL_H);
        const cb = decodeByNumbers(b, TILE_CELL_W, TILE_CELL_H);
        expect(Math.min(...ca.map((c) => c.rowNum)) - 1).toBe(Math.max(...cb.map((c) => c.rowNum)));
      }
    }
  });

  it("each joining edge names the page next to it, on the right side", () => {
    for (const p of tiles96) {
      const t = p.meta!.tile as { left?: number; right?: number; top?: number; bottom?: number };
      const say = (tag: string) => texts(p, tag).map((x) => x.s);
      expect(say("join-note-left")).toEqual(t.left === undefined ? [] : [`Joins page ${t.left}`]);
      expect(say("join-note-right")).toEqual(t.right === undefined ? [] : [`Joins page ${t.right}`]);
      expect(say("join-note-top")).toEqual(t.top === undefined ? [] : [`Joins page ${t.top} (above)`]);
      expect(say("join-note-bottom")).toEqual(t.bottom === undefined ? [] : [`Joins page ${t.bottom} (below)`]);
    }
  });

  it("the overview picture matches the page arrangement: page numbers in the right places, in the chart's real proportions", () => {
    const ov = doc96.pages[0];
    const plan = tilePlanFor(m96);
    const boxes = rects(ov, "asm-tile");
    const edges = rects(ov, "asm-edge");
    const nums = texts(ov, "asm-page");
    expect(boxes).toHaveLength(16);
    expect(nums).toHaveLength(16);
    // work out each page number's place in the picture from where it is drawn
    const inside = (t: TextOp) => boxes.find((b) => t.x > b.x && t.x < b.x + b.w && t.y > b.y && t.y < b.y + b.h)!;
    const xs = [...new Set(boxes.map((b) => Math.round(b.x * 100)))].sort((a, b) => a - b);
    const ys = [...new Set(boxes.map((b) => Math.round(b.y * 100)))].sort((a, b) => a - b);
    expect(xs).toHaveLength(plan.across);
    expect(ys).toHaveLength(plan.down);
    for (const t of nums) {
      const b = inside(t);
      const tc = xs.indexOf(Math.round(b.x * 100));
      const tr = ys.indexOf(Math.round(b.y * 100));
      const want = plan.tiles.find((u) => u.tc === tc && u.tr === tr)!;
      expect(Number(t.s)).toBe(want.page);
    }
    // page numbers run left to right, then top to bottom
    const order = [...nums].sort((a, b) => a.y - b.y || a.x - b.x).map((t) => Number(t.s));
    expect(order).toEqual(Array.from({ length: 16 }, (_, i) => i + 2));
    // proportions: each box is as wide and tall as its stitches would be on paper, all at one scale
    const scale = edges[0].w / (24 * TILE_CELL_W);
    for (const b of edges) {
      expect(b.w / scale).toBeCloseTo(24 * TILE_CELL_W, 6);
      expect(b.h / scale).toBeCloseTo(36 * TILE_CELL_H, 6);
    }
    // the stitch ranges written in each box are the global ones
    const ranges = texts(ov, "asm-range").map((t) => t.s);
    expect(ranges).toContain("col 73–96");
    expect(ranges).toContain("row 1–36");
    expect(ranges).toContain("row 109–144");
  });

  it("every page carries a small 'you are here' picture with exactly its own page marked", () => {
    for (const p of tiles96) {
      const t = p.meta!.tile as { tc: number; tr: number };
      const tiles = rects(p, "mini-tile");
      expect(tiles).toHaveLength(16);
      const dark = tiles.filter((r) => r.fill === INK);
      expect(dark).toHaveLength(1);
      const xs = [...new Set(tiles.map((r) => Math.round(r.x * 100)))].sort((a, b) => a - b);
      const ys = [...new Set(tiles.map((r) => Math.round(r.y * 100)))].sort((a, b) => a - b);
      expect([xs.indexOf(Math.round(dark[0].x * 100)), ys.indexOf(Math.round(dark[0].y * 100))]).toEqual([t.tc, t.tr]);
    }
  });

  it("nothing runs off a page and the chart fits the printable area", () => {
    for (const p of doc96.pages) {
      for (const op of p.ops) {
        const b = opBox(op);
        expect(b.x0).toBeGreaterThanOrEqual(28);
        expect(b.y0).toBeGreaterThanOrEqual(28);
        expect(b.x1).toBeLessThanOrEqual(p.width - 28);
        expect(b.y1).toBeLessThanOrEqual(p.height - 28);
      }
    }
    expect(TILE_MAX_COLS * TILE_CELL_W).toBeLessThanOrEqual(500);
    expect(TILE_MAX_ROWS * TILE_CELL_H).toBeLessThanOrEqual(620);
  });

  it("letters: on by default in the options and in every stitch, off when switched off; the legend always has them", () => {
    const withLetters = tiles96.reduce((n, p) => n + texts(p, "letter").length, 0);
    expect(withLetters).toBe(96 * 144);
    const m = model(40, 60, 5);
    const off = buildPdfDoc(m, { layout: "tiled", letters: false }).pages;
    expect(off.reduce((n, p) => n + texts(p, "letter").length, 0)).toBe(0);
    expect(texts(off[0], "legend-letter").map((t) => t.s)).toEqual(m.colors.map((_, i) => letterFor(i)));
    // each letter drawn is the letter of the stitch under it
    for (const p of tiles96.slice(0, 4)) {
      const cells = decodeByNumbers(p, TILE_CELL_W, TILE_CELL_H);
      const byPos = new Map(cells.map((c) => [`${Math.round(c.cx * 1000)},${Math.round(c.cy * 1000)}`, c]));
      for (const l of texts(p, "letter")) {
        const c = byPos.get(`${Math.round(l.x * 1000)},${Math.round((l.y - 10.5 * 0.36) * 1000)}`)!;
        expect(l.s).toBe(m96.letterOf[m96.matrix.cells[144 - c.rowNum][96 - c.col]]);
      }
    }
  });

  it("the overview has the exact legend counts and the gauge", () => {
    const ov = doc96.pages[0];
    expect(texts(ov, "legend-count").map((t) => t.s)).toEqual(m96.colors.map((c) => `${c.count.toLocaleString("en-US")} ${c.count === 1 ? "stitch" : "stitches"}`));
    expect(texts(ov, "legend-total")[0].s).toBe("Total: 13,824 stitches (96 × 144)");
    expect(texts(ov, "info").map((t) => t.s).join(" ")).toContain(gaugeLine());
    expect(texts(ov, "step").map((t) => t.s).join(" ")).toContain("100% (Actual size)");
  });

  it("a chart that fits one page makes one chart page and says there is nothing to join", () => {
    const m = model(24, 36, 4);
    const pages = buildPdfDoc(m, { layout: "tiled", letters: true }).pages;
    expect(pages).toHaveLength(2);
    expect(lines(pages[1], "join")).toHaveLength(0);
    expect(lines(pages[1], "border")).toHaveLength(4);
    expect(texts(pages[0], "step").map((t) => t.s).join(" ")).toContain("nothing to join");
    expect(texts(pages[0], "asm-page")).toHaveLength(0);
  });
});

describe("big charts export", () => {
  for (const layout of ["fit", "tiled"] as const) {
    it(`96 x 144 (${layout}) is made quickly and stays a sensible size`, () => {
      const m = model(96, 144, 10);
      const t0 = performance.now();
      const bytes = buildPdf(m, { layout, letters: true });
      const ms = performance.now() - t0;
      expect(bytes.length).toBeGreaterThan(10_000);
      expect(bytes.length).toBeLessThan(3_000_000);
      expect(ms).toBeLessThan(4000);
    });
  }
  it("does not change the chart it is given", () => {
    const m = chart(30, 40, 4);
    const before = JSON.stringify(m);
    buildPdf(buildPatternModel(m), { layout: "tiled", letters: true });
    buildPdf(buildPatternModel(m), { layout: "fit", letters: true });
    expect(JSON.stringify(m)).toBe(before);
  });
  it("uses the edited chart: changing one stitch changes the file and moves the counts", () => {
    const m = chart(30, 40, 4);
    const a = buildPatternModel(m);
    const cells = m.cells.map((r) => [...r]);
    cells[10][5] = (cells[10][5] + 1) % 4;
    const b = buildPatternModel({ ...m, cells });
    expect(Buffer.from(buildPdf(a)).equals(Buffer.from(buildPdf(b)))).toBe(false);
    const countsA = a.colors.map((c) => c.count);
    const countsB = b.colors.map((c) => c.count);
    expect(countsA.reduce((x, y) => x + y)).toBe(1200);
    expect(countsB.reduce((x, y) => x + y)).toBe(1200);
    expect(countsA).not.toEqual(countsB);
  });
});

void (undefined as unknown as Op);
