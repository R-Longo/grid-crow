import { STITCH_ASPECT, finishedLine, sizeLine, NUMBERING_NOTE } from "../pattern";
import type { PatternModel } from "../pattern";
import { INK, MUTED, drawRegion } from "./chart";
import type { Region } from "./chart";
import { drawInfo } from "./info";
import { textWidth } from "./metrics";
import { LETTER } from "./ops";
import type { Op, PdfPage } from "./ops";

/** Letters inside stitches are only printed when a stitch is at least this tall (points); smaller they would crowd the stitch. */
export const MIN_LETTER_CELL = 8.5;
const MAX_CELL = 24;
const M = 36;
const HEADER = 34;
const LABEL = 14;

/** 1, 5 or 10: the smallest step whose labels do not touch. */
export function pickStep(cellSize: number, labelSpan: number): number {
  for (const s of [1, 5, 10]) if (s * cellSize >= labelSpan) return s;
  return 10;
}

interface Plan {
  landscape: boolean;
  pageW: number;
  pageH: number;
  cellH: number;
}

function planFor(model: PatternModel, landscape: boolean, reservedBelow: number): Plan {
  const pageW = landscape ? LETTER.height : LETTER.width;
  const pageH = landscape ? LETTER.width : LETTER.height;
  const availW = pageW - 2 * (M + LABEL + 2);
  const availH = pageH - (M + HEADER + LABEL) - (M + LABEL) - reservedBelow;
  const cellH = Math.min(availW / (model.cols * STITCH_ASPECT), availH / model.rows, MAX_CELL);
  return { landscape, pageW, pageH, cellH };
}

function header(ops: Op[], model: PatternModel, pageW: number, subtitle?: string) {
  ops.push({ k: "text", x: M, y: M + 12, s: "GridCrow crochet chart", size: 14, bold: true, color: INK, tag: "title" });
  const right = `${sizeLine(model)} · about ${finishedLine(model).replace("Finished size about ", "")}`;
  ops.push({ k: "text", x: pageW - M, y: M + 12, s: right, size: 10, color: INK, align: "right", tag: "title-size" });
  ops.push({ k: "text", x: M, y: M + 26, s: subtitle ?? NUMBERING_NOTE, size: 9, color: MUTED, tag: "title-note" });
}

/** Fit to Page: the whole chart on one US Letter page, never clipped. The color key sits under it when there is room, otherwise on a second page. */
export function layoutFit(model: PatternModel, options: { letters: boolean }): PdfPage[] {
  const measure = (w: number) => {
    const scratch: Op[] = [];
    return drawInfo(scratch, model, 0, 0, w) + 4;
  };
  // Pick the page direction that gives the bigger stitches.
  const portrait = planFor(model, false, 0);
  const landscape = planFor(model, true, 0);
  const full = landscape.cellH > portrait.cellH + 1e-9 ? landscape : portrait;
  // Put the key under the chart when that costs the chart less than a tenth of its size.
  const infoH = measure(full.pageW - 2 * M);
  const withKey = planFor(model, full.landscape, infoH + 16);
  const inlineKey = withKey.cellH >= full.cellH * 0.9;
  const plan = inlineKey ? withKey : full;
  const { pageW, pageH, cellH } = plan;
  const cellW = cellH * STITCH_ASPECT;

  const lettersFit = cellH >= MIN_LETTER_CELL;
  const letters = options.letters && lettersFit;
  const ns = 7;
  const chartW = model.cols * cellW;
  const chartH = model.rows * cellH;
  const x0 = (pageW - chartW) / 2;
  const y0 = M + HEADER + LABEL;

  const ops: Op[] = [];
  header(ops, model, pageW);
  const region: Region = {
    x0,
    y0,
    cellW,
    cellH,
    c0: 0,
    c1: model.cols,
    r0: 0,
    r1: model.rows,
    letters,
    letterSize: Math.min(cellH * 0.6, 14),
    numberSize: ns,
    stepX: pickStep(cellW, textWidth(String(model.cols), ns, true) + 3),
    stepY: pickStep(cellH, ns * 1.3),
    gutter: 8,
    joins: { left: false, right: false, top: false, bottom: false },
    thinWidth: cellH >= 2.2 ? 0.25 : 0,
    heavyWidth: 0.9,
    joinWidth: 0,
  };
  drawRegion(ops, model, region);

  const note = options.letters && !lettersFit ? ["Letters are not printed inside the stitches on this page because they would be too small to read. Choose Large print (tiled pages) for lettered stitches."] : [];
  const pages: PdfPage[] = [];
  const meta = { kind: "fit", chart: { x0, y0, cellW, cellH, cols: model.cols, rows: model.rows }, letters, inlineKey, landscape: plan.landscape };
  if (inlineKey) {
    drawInfo(ops, model, M, y0 + chartH + LABEL + 14, pageW - 2 * M, note);
    pages.push({ width: pageW, height: pageH, ops, meta });
  } else {
    pages.push({ width: pageW, height: pageH, ops, meta });
    const info: Op[] = [];
    header(info, model, LETTER.width, "Colors and details");
    drawInfo(info, model, M, M + HEADER + 10, LETTER.width - 2 * M, note);
    pages.push({ width: LETTER.width, height: LETTER.height, ops: info, meta: { kind: "info" } });
  }
  return pages;
}
