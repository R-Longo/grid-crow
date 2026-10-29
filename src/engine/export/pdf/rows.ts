import { inkOn, startingSteps } from "../pattern";
import type { PatternModel } from "../pattern";
import { rowInstructions } from "../rows";
import { INK, MUTED } from "./chart";
import { drawInfo, paragraph } from "./info";
import { textWidth } from "./metrics";
import { LETTER } from "./ops";
import type { Op, PdfPage } from "./ops";

const M = 36;
const LABEL_W = 118;
const BOX_H = 19;
const GAP = 3;
const LINE_H = BOX_H + 5;
const ROW_GAP = 6;

function header(ops: Op[], model: PatternModel, subtitle: string) {
  ops.push({ k: "text", x: M, y: M + 12, s: "GridCrow row-by-row instructions", size: 14, bold: true, color: INK, tag: "title" });
  ops.push({ k: "text", x: LETTER.width - M, y: M + 12, s: `${model.cols} stitches × ${model.rows} rows`, size: 10, color: INK, align: "right", tag: "title-size" });
  ops.push({ k: "text", x: M, y: M + 26, s: subtitle, size: 9, color: MUTED, tag: "title-note" });
}

const NOTE = "Each box is one color: the number is how many single crochet stitches; the small letter is the yarn color. Work boxes left to right on the page.";

/**
 * Row-by-row text instructions: for each row, its number, right side or wrong side, and the blocks of color in the order
 * they are worked. Rows run from row 1 upward. Drawn from the same pattern model (so it can never disagree with the chart).
 */
export function layoutRows(model: PatternModel): PdfPage[] {
  const pages: PdfPage[] = [];
  let ops: Op[] = [];
  let y = 0;
  let first = true;
  const bottom = LETTER.height - M;

  const newPage = () => {
    ops = [];
    pages.push({ width: LETTER.width, height: LETTER.height, ops, meta: { kind: "rows" } });
    header(ops, model, first ? "Row 1 is the bottom row of the chart. RS = right side, WS = wrong side." : "Row-by-row instructions, continued");
    y = M + 40;
  };
  newPage();

  // Start of the pattern, then the color key letters.
  y = paragraph(ops, "Start", M, y - 6, LETTER.width - 2 * M, 11, { bold: true, color: INK, tag: "start-heading" });
  for (const s of startingSteps(model.cols)) {
    y = paragraph(ops, `${s.heading}: ${s.text}`, M, y, LETTER.width - 2 * M, 9.5, { tag: "start-text" });
  }
  y = paragraph(ops, NOTE, M, y + 2, LETTER.width - 2 * M, 9.5, { tag: "rows-note" });
  y += 18;
  let kx = M;
  for (const c of model.colors) {
    const label = `${c.letter}  ${c.hex}`;
    const w = 12 + 6 + textWidth(label, 9, false) + 14;
    if (kx + w > LETTER.width - M) {
      kx = M;
      y += 16;
    }
    ops.push({ k: "rect", x: kx, y: y - 9, w: 12, h: 12, fill: c.hex, tag: "key-swatch" });
    ops.push({ k: "text", x: kx + 18, y, s: label, size: 9, color: INK, tag: "key-label" });
    kx += w;
  }
  y += 20;
  first = false;

  const maxX = LETTER.width - M;
  for (const r of rowInstructions(model.matrix)) {
    // Lay out the boxes first so a row never splits across pages.
    const boxes: { x: number; line: number; w: number; text: string; fill: string; letter: string; count: number }[] = [];
    let x = M + LABEL_W;
    let line = 0;
    for (const run of r.runs) {
      const text = String(run.count);
      const w = Math.max(22, textWidth(text, 10, true) + 12);
      if (x + w > maxX) {
        x = M + LABEL_W;
        line++;
      }
      boxes.push({ x, line, w, text, fill: model.hexOf[run.index], letter: model.letterOf[run.index] ?? "", count: run.count });
      x += w + GAP;
    }
    const height = (line + 1) * LINE_H;
    if (y + height > bottom) newPage();
    const top = y;
    ops.push({
      k: "text",
      x: M,
      y: top + 13,
      s: `Row ${r.row} (${r.side})`,
      size: 10.5,
      bold: true,
      color: INK,
      tag: "row-label",
    });
    ops.push({ k: "text", x: M + 78, y: top + 13, s: r.direction === "rtl" ? "R to L" : "L to R", size: 8, color: MUTED, tag: "row-dir" });
    for (const b of boxes) {
      const by = top + b.line * LINE_H;
      ops.push({ k: "rect", x: b.x - 0.6, y: by - 0.6, w: b.w + 1.2, h: BOX_H + 1.2, fill: INK, tag: "run-border" });
      ops.push({ k: "rect", x: b.x, y: by, w: b.w, h: BOX_H, fill: b.fill, tag: "run-box" });
      const ink = inkOn(b.fill);
      ops.push({ k: "text", x: b.x + b.w / 2, y: by + 13.5, s: b.text, size: 10, bold: true, color: ink, align: "center", tag: "run-count" });
      if (b.letter) ops.push({ k: "text", x: b.x + b.w - 2, y: by + BOX_H - 2.5, s: b.letter, size: 5.5, color: ink, align: "right", tag: "run-letter" });
    }
    y += height + ROW_GAP;
  }

  // Colors and totals on a last page, like the other layouts.
  first = false;
  const info: Op[] = [];
  header(info, model, "Colors and details");
  drawInfo(info, model, M, M + 44, LETTER.width - 2 * M);
  pages.push({ width: LETTER.width, height: LETTER.height, ops: info, meta: { kind: "info" } });
  return pages;
}
