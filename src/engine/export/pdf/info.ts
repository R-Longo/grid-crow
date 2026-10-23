import { NUMBERING_NOTE, finishedLine, formatCount, gaugeLine, sizeLine, yardsText, yarnNote } from "../pattern";
import type { PatternModel } from "../pattern";
import { INK, MUTED } from "./chart";
import { textWidth, wrapToWidth } from "./metrics";
import type { Op } from "./ops";

export const STITCH_COUNT_NOTE = "Counts are single-crochet stitches in each color.";

/** Lines of text drawn under a heading, wrapped to the width. Returns the y after the last line. */
export function paragraph(ops: Op[], text: string, x: number, y: number, w: number, size: number, opts: { bold?: boolean; color?: string; tag?: string } = {}): number {
  const lead = size * 1.35;
  for (const line of wrapToWidth(text, size, w, opts.bold)) {
    y += lead;
    ops.push({ k: "text", x, y, s: line, size, bold: opts.bold, color: opts.color ?? MUTED, tag: opts.tag ?? "info" });
  }
  return y;
}

/**
 * The color key and the pattern facts: swatch, letter, hex and exact stitch count for each yarn color, the total, the
 * sizes and the reference gauge. Returns the y where it ends. Drawn from the pattern model only, like the chart.
 */
export function drawInfo(ops: Op[], model: PatternModel, x: number, y: number, w: number, extra: string[] = []): number {
  const title = 12.5;
  y += title;
  ops.push({ k: "text", x, y, s: "Yarn colors, stitch counts and rough yarn amounts", size: title, bold: true, color: INK, tag: "legend-title" });
  y += 8;

  const two = model.colors.length > 5 && w >= 440;
  const perCol = two ? Math.ceil(model.colors.length / 2) : model.colors.length;
  const colW = two ? Math.floor((w - 24) / 2) : Math.min(w, 340);
  const rowH = 19;
  const sw = 12;
  model.colors.forEach((c, i) => {
    const col = two ? Math.floor(i / perCol) : 0;
    const row = two ? i % perCol : i;
    const cx = x + col * (colW + 24);
    const top = y + row * rowH + 3;
    ops.push({ k: "rect", x: cx - 0.8, y: top - 0.8, w: sw + 1.6, h: sw + 1.6, fill: INK, tag: "legend-swatch-border" });
    ops.push({ k: "rect", x: cx, y: top, w: sw, h: sw, fill: c.hex, tag: "legend-swatch" });
    const base = top + sw - 2;
    ops.push({ k: "text", x: cx + sw + 8, y: base, s: c.letter, size: 12, bold: true, color: INK, tag: "legend-letter" });
    ops.push({ k: "text", x: cx + sw + 8 + 22, y: base, s: c.hex, size: 11, color: INK, tag: "legend-hex" });
    ops.push({ k: "text", x: cx + colW - 78, y: base, s: `${formatCount(c.count)} ${c.count === 1 ? "stitch" : "stitches"}`, size: 11, color: INK, align: "right", tag: "legend-count" });
    ops.push({ k: "text", x: cx + colW, y: base, s: yardsText(c.lowYards, c.highYards), size: 10.5, color: INK, align: "right", tag: "legend-yards" });
  });
  y += perCol * rowH + 6;
  y += 11;
  ops.push({ k: "text", x, y, s: `Total: ${formatCount(model.total)} stitches (${model.cols} × ${model.rows})`, size: 11, bold: true, color: INK, tag: "legend-total" });
  ops.push({ k: "text", x: x + w, y, s: `About ${yardsText(model.lowYards, model.highYards)} of yarn (rough estimate)`, size: 11, bold: true, color: INK, align: "right", tag: "legend-yarn-total" });
  y += 6;
  y = paragraph(ops, sizeLine(model) + ". " + finishedLine(model) + ".", x, y, w, 10, { color: INK });
  y = paragraph(ops, gaugeLine(), x, y, w, 9.5);
  y = paragraph(ops, NUMBERING_NOTE, x, y, w, 9.5);
  y = paragraph(ops, `${STITCH_COUNT_NOTE} ${yarnNote(model)}`, x, y, w, 9.5, { tag: "yarn-note" });
  for (const e of extra) y = paragraph(ops, e, x, y, w, 9.5);
  void textWidth;
  return y;
}
