import { STITCH_ASPECT, finishedLine, sizeLine, NUMBERING_NOTE } from "../pattern";
import type { PatternModel } from "../pattern";
import { INK, MUTED, drawRegion } from "./chart";
import type { Region } from "./chart";
import { drawInfo, paragraph } from "./info";
import { LETTER } from "./ops";
import type { Op, PdfPage } from "./ops";
import { planTiles } from "./tiles";
import type { Tile, TilePlan } from "./tiles";

/** Large print stitches are drawn at the real crochet gauge: 4 stitches and 4.5 rows to the inch, so the printed chart is the size of the finished piece. */
export const TILE_CELL_H = 16;
export const TILE_CELL_W = TILE_CELL_H * STITCH_ASPECT; // 18
export const TILE_MAX_COLS = 27;
export const TILE_MAX_ROWS = 38;
const CHART_TOP = 100;
const M = 36;
const GUTTER = 8;

export function tilePlanFor(model: PatternModel): TilePlan {
  return planTiles(model.cols, model.rows, TILE_MAX_COLS, TILE_MAX_ROWS, 2);
}

/** The row numbers a tile covers, from the chart's own numbering (row 1 is the bottom). */
export function tileRowRange(model: PatternModel, t: Tile): { bottom: number; top: number } {
  return { bottom: model.rows - t.r1 + 1, top: model.rows - t.r0 };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The assembly overview: one box per page, laid out exactly as the pages go together, in the chart's real proportions.
 * Used large on the overview page (with page numbers and stitch ranges) and small on every page (with "you are here").
 */
export function drawAssembly(ops: Op[], plan: TilePlan, box: Box, opts: { numbers: boolean; ranges: boolean; model?: PatternModel; highlight?: number; tag?: string }): Box {
  const totalW = plan.cols * TILE_CELL_W;
  const totalH = plan.rows * TILE_CELL_H;
  const s = Math.min(box.w / totalW, box.h / totalH);
  const w = totalW * s;
  const h = totalH * s;
  const x0 = box.x + (box.w - w) / 2;
  const y0 = box.y;
  const tag = opts.tag ?? "asm";
  for (const t of plan.tiles) {
    const x = x0 + t.c0 * TILE_CELL_W * s;
    const y = y0 + t.r0 * TILE_CELL_H * s;
    const tw = (t.c1 - t.c0) * TILE_CELL_W * s;
    const th = (t.r1 - t.r0) * TILE_CELL_H * s;
    const here = opts.highlight === t.page;
    ops.push({ k: "rect", x, y, w: tw, h: th, fill: INK, tag: `${tag}-edge` });
    const inset = opts.numbers ? 1 : 0.6;
    ops.push({ k: "rect", x: x + inset, y: y + inset, w: tw - 2 * inset, h: th - 2 * inset, fill: here ? INK : "#ffffff", tag: `${tag}-tile` });
    if (opts.numbers) {
      const size = Math.max(7, Math.min(16, Math.min(tw, th) * 0.34));
      const model = opts.model;
      const showRanges = opts.ranges && model && tw >= 52 && th >= 44;
      ops.push({ k: "text", x: x + tw / 2, y: y + th / 2 + size * (showRanges ? -0.05 : 0.36), s: String(t.page), size, bold: true, color: here ? "#ffffff" : INK, align: "center", tag: `${tag}-page` });
      if (showRanges && model) {
        const rr = tileRowRange(model, t);
        ops.push({ k: "text", x: x + tw / 2, y: y + th / 2 + size * 0.75, s: `col ${t.c0 + 1}–${t.c1}`, size: 6.5, color: here ? "#ffffff" : MUTED, align: "center", tag: `${tag}-range` });
        ops.push({ k: "text", x: x + tw / 2, y: y + th / 2 + size * 0.75 + 8, s: `row ${rr.bottom}–${rr.top}`, size: 6.5, color: here ? "#ffffff" : MUTED, align: "center", tag: `${tag}-range` });
      }
    }
  }
  return { x: x0, y: y0, w, h };
}

function overviewPage(model: PatternModel, plan: TilePlan, lettersOn: boolean): PdfPage {
  const ops: Op[] = [];
  const W = LETTER.width;
  const contentW = W - 2 * M;
  const last = plan.tiles[plan.tiles.length - 1].page;
  ops.push({ k: "text", x: M, y: M + 14, s: "GridCrow crochet chart: large print", size: 16, bold: true, color: INK, tag: "title" });
  ops.push({ k: "text", x: M, y: M + 32, s: `${sizeLine(model)} · ${finishedLine(model).replace("Finished size about", "finished size about")}`, size: 10.5, color: INK, tag: "title-size" });
  ops.push({ k: "text", x: M, y: M + 46, s: `${NUMBERING_NOTE} Page numbers below match the page numbers in this PDF.`, size: 9, color: MUTED, tag: "title-note" });

  let y = M + 60;
  ops.push({ k: "text", x: M, y: y + 12, s: plan.tiles.length === 1 ? "Printing" : "How to put it together", size: 12, bold: true, color: INK, tag: "steps-title" });
  y += 12;
  const steps =
    plan.tiles.length === 1
      ? [`Print page ${last} at 100% (Actual size) on US Letter paper. The whole chart fits on that one page, so there is nothing to join.`]
      : [
          `Print pages ${plan.firstPage}–${last} at 100% (Actual size) on US Letter paper. Do not choose "Fit to page".`,
          "Lay the pages out as in the picture below. Every stitch is on exactly one page, so nothing overlaps.",
          "On each edge that has a bold line, trim off the white paper margin along the line.",
          "Butt the trimmed edges together so the bold lines meet and the small tick marks line up, then tape the back.",
        ];
  steps.forEach((t, i) => {
    const n = steps.length === 1 ? "" : `${i + 1}.  `;
    y = paragraph(ops, n + t, M, y, contentW, 10, { color: INK, tag: "step" });
  });
  y += 8;

  // The key goes last, so measure it first and give the picture whatever room is left.
  const scratch: Op[] = [];
  const extra = lettersOn ? ["Each stitch has its color's letter in it, so the colors can be told apart on a black-and-white print."] : [];
  const infoH = drawInfo(scratch, model, 0, 0, contentW, extra) + 6;
  const diagramTop = y + 4;
  if (plan.tiles.length > 1) {
    ops.push({ k: "text", x: M, y: diagramTop + 12, s: "Assembly overview (pages are shown in their real proportions)", size: 10, bold: true, color: INK, tag: "asm-title" });
  }
  const available = LETTER.height - M - infoH - (diagramTop + 20) - 10;
  let box: Box = { x: M, y: diagramTop, w: 0, h: 0 };
  if (plan.tiles.length > 1) box = drawAssembly(ops, plan, { x: M, y: diagramTop + 20, w: contentW, h: Math.max(available, 60) }, { numbers: true, ranges: true, model, tag: "asm" });
  const infoTop = plan.tiles.length > 1 ? Math.max(box.y + box.h + 14, LETTER.height - M - infoH) : diagramTop + 10;
  drawInfo(ops, model, M, infoTop, contentW, extra);
  return { width: W, height: LETTER.height, ops, meta: { kind: "overview", plan, assembly: box } };
}

function tilePage(model: PatternModel, plan: TilePlan, t: Tile, letters: boolean): PdfPage {
  const ops: Op[] = [];
  const W = LETTER.width;
  const nCols = t.c1 - t.c0;
  const nRows = t.r1 - t.r0;
  const chartW = nCols * TILE_CELL_W;
  const chartH = nRows * TILE_CELL_H;
  const x0 = (W - chartW) / 2;
  const y0 = CHART_TOP;
  const last = plan.tiles[plan.tiles.length - 1].page;
  const rr = tileRowRange(model, t);

  ops.push({ k: "text", x: M, y: 46, s: "GridCrow crochet chart", size: 12, bold: true, color: INK, tag: "title" });
  ops.push({ k: "text", x: M, y: 61, s: `Columns ${t.c0 + 1}–${t.c1} of ${model.cols}  ·  Rows ${rr.bottom}–${rr.top} of ${model.rows}`, size: 10, bold: true, color: INK, tag: "range" });
  if (plan.tiles.length > 1) ops.push({ k: "text", x: M, y: 75, s: `Section ${t.tr + 1} down, ${t.tc + 1} across`, size: 8.5, color: MUTED, tag: "section" });
  ops.push({ k: "text", x: W - M, y: 46, s: `Page ${t.page} of ${last}`, size: 12, bold: true, color: INK, align: "right", tag: "page-id" });
  if (plan.tiles.length > 1) drawAssembly(ops, plan, { x: W - M - 74, y: 52, w: 74, h: 36 }, { numbers: false, ranges: false, highlight: t.page, tag: "mini" });

  const region: Region = {
    x0,
    y0,
    cellW: TILE_CELL_W,
    cellH: TILE_CELL_H,
    c0: t.c0,
    c1: t.c1,
    r0: t.r0,
    r1: t.r1,
    letters,
    letterSize: 10.5,
    numberSize: 7,
    stepX: 1,
    stepY: 1,
    gutter: GUTTER,
    joins: { left: t.left !== undefined, right: t.right !== undefined, top: t.top !== undefined, bottom: t.bottom !== undefined },
    thinWidth: 0.4,
    heavyWidth: 1.1,
    joinWidth: 3,
  };
  drawRegion(ops, model, region);

  // Who is next to this page, written beside the joining edge.
  const midY = y0 + chartH / 2;
  const midX = x0 + chartW / 2;
  const note = (s: string) => s;
  if (t.left !== undefined) ops.push({ k: "text", x: x0 - 22, y: midY, s: note(`Joins page ${t.left}`), size: 9, bold: true, color: INK, align: "center", rot: 90, tag: "join-note-left" });
  if (t.right !== undefined) ops.push({ k: "text", x: x0 + chartW + 34, y: midY, s: note(`Joins page ${t.right}`), size: 9, bold: true, color: INK, align: "center", rot: 90, tag: "join-note-right" });
  if (t.top !== undefined) ops.push({ k: "text", x: midX, y: y0 - 24, s: note(`Joins page ${t.top} (above)`), size: 9, bold: true, color: INK, align: "center", tag: "join-note-top" });
  if (t.bottom !== undefined) ops.push({ k: "text", x: midX, y: y0 + chartH + 28, s: note(`Joins page ${t.bottom} (below)`), size: 9, bold: true, color: INK, align: "center", tag: "join-note-bottom" });

  ops.push({ k: "text", x: M, y: LETTER.height - 41, s: "Print at 100% (Actual size), not Fit to page. Bold lines are where pages join: trim to the line, match the ticks, tape.", size: 8, color: MUTED, tag: "footer" });
  ops.push({ k: "text", x: M, y: LETTER.height - 30, s: "Row 1 is the bottom row. Stitches are counted from the left. Numbers count the whole chart, not just this page.", size: 8, color: MUTED, tag: "footer-note" });
  return { width: W, height: LETTER.height, ops, meta: { kind: "tile", tile: t, chart: { x0, y0, cellW: TILE_CELL_W, cellH: TILE_CELL_H } } };
}

/** Large Print: an overview page, then the chart in pages that join along bold alignment lines. */
export function layoutTiled(model: PatternModel, options: { letters: boolean }): PdfPage[] {
  const plan = tilePlanFor(model);
  return [overviewPage(model, plan, options.letters), ...plan.tiles.map((t) => tilePage(model, plan, t, options.letters))];
}

/** How many pages Large Print makes for a chart of this size (the overview page plus the chart pages), without building them. */
export function tiledPageCount(cols: number, rows: number): number {
  return 1 + planTiles(cols, rows, TILE_MAX_COLS, TILE_MAX_ROWS, 2).tiles.length;
}
