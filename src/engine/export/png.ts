import { STITCH_ASPECT, finishedLine, formatCount, gaugeLine, inkOn, labelNumbers, sizeLine, NUMBERING_NOTE, stitchNumbers, yardsText, yarnNote } from "./pattern";
import type { PatternModel } from "./pattern";

/** The small part of the canvas drawing API the exporters use, so they can be tested without a browser. */
export interface Ctx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

/**
 * A PNG large enough to zoom into, small enough for a phone's canvas. Phones refuse canvases much beyond 16.7 million
 * pixels, so cells are drawn as large as the budget allows (all sizes keep the exact 9:8 shape of a real stitch).
 */
export const PNG_LIMITS = { maxPixels: 12_000_000, maxSide: 12_000 };
/** Cell widths to try, largest first. Each is a multiple of 9 so the cell height (8/9 of it) is a whole number of pixels. */
const CELL_WIDTHS = [54, 45, 36, 27, 18];

const INK = "#17191b";
const MUTED = "#5b5048";
const PAPER = "#fbf7f0";
const GRID = "rgba(128,128,128,0.55)";
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const SERIF = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';

export interface TextItem {
  text: string;
  x: number;
  /** Vertical centre of the text. */
  y: number;
  size: number;
  bold?: boolean;
  serif?: boolean;
  color: string;
  align: CanvasTextAlign;
}

export interface LegendEntry {
  letter: string;
  hex: string;
  count: number;
  swatch: { x: number; y: number; size: number };
  letterText: TextItem;
  hexText: TextItem;
  countText: TextItem;
  /** "about 40–60 yd": a rough estimate. */
  yardsText: TextItem;
}

export interface PngLayout {
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  /** Top-left of the stitch area. */
  x0: number;
  y0: number;
  chartW: number;
  chartH: number;
  /** 1 = every number is labelled, 5 = the first and every 5th. */
  labelStep: 1 | 5;
  showLetters: boolean;
  numberSize: number;
  letterSize: number;
  header: TextItem[];
  legendTitle: TextItem;
  legend: LegendEntry[];
  total: TextItem;
  /** The estimated yarn for the whole chart, and the lines that say what the estimate is. */
  yarnTotal: TextItem;
  yarnNote: TextItem[];
}

/** Break text into lines of about `maxChars` characters, at spaces. */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && (line + " " + word).length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + " " + word : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function build(model: PatternModel, cellW: number, letters: boolean): PngLayout {
  const s = cellW / 27;
  const cellH = cellW / model.aspect;
  const numberSize = Math.max(9, Math.round(cellH * 0.5));
  const labelStep: 1 | 5 = cellH >= 19 ? 1 : 5;
  const showLetters = letters && cellH >= 20;
  const letterSize = Math.round(cellH * 0.55);
  const gutterX = Math.round(numberSize * 2.7);
  const gutterY = Math.round(numberSize * 2.2);
  const M = Math.round(48 * s);
  const chartW = model.cols * cellW;
  const chartH = model.rows * cellH;
  const width = Math.max(chartW + 2 * gutterX + 2 * M, Math.round(1300 * s));
  const x0 = Math.round((width - chartW) / 2);

  // ---- header
  const titleSize = Math.round(46 * s);
  const info = Math.round(26 * s);
  // Every header line wraps to the room between the margins (0.6 em per character is a safe average for this sans-serif).
  const maxChars = Math.floor((width - 2 * M) / (info * 0.6));
  const header: TextItem[] = [];
  let y = M + titleSize * 0.65;
  header.push({ text: "GridCrow crochet chart", x: M, y, size: titleSize, bold: true, serif: true, color: INK, align: "left" });
  y += titleSize * 0.65 + info * 0.9;
  const lines = [sizeLine(model), finishedLine(model), ...wrapText(gaugeLine(model.gauge), maxChars), ...wrapText(NUMBERING_NOTE, maxChars)];
  lines.forEach((t, i) => {
    header.push({ text: t, x: M, y, size: info, color: i === 0 ? INK : MUTED, bold: i === 0, align: "left" });
    y += info * 1.5;
  });
  const headerBottom = Math.round(y + info * 0.4);

  const y0 = headerBottom + gutterY;
  const chartBottom = y0 + chartH;

  // ---- legend
  const legendSize = Math.round(28 * s);
  const rowH = Math.round(52 * s);
  const swatch = Math.round(rowH * 0.7);
  const legendCols = width - 2 * M >= Math.round(2000 * s) ? 2 : 1;
  const colW = Math.floor((width - 2 * M) / legendCols);
  const legendTop = chartBottom + gutterY + Math.round(36 * s);
  const legendTitle: TextItem = { text: "Yarn colors, stitch counts and rough yarn amounts", x: M, y: legendTop + legendSize * 0.6, size: Math.round(legendSize * 1.15), bold: true, serif: true, color: INK, align: "left" };
  const entriesTop = legendTop + Math.round(legendSize * 1.9);
  const perCol = Math.ceil(model.colors.length / legendCols);
  const legend: LegendEntry[] = model.colors.map((c, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    const x = M + col * colW;
    const cy = entriesTop + row * rowH + rowH / 2;
    const sw = { x, y: Math.round(cy - swatch / 2), size: swatch };
    const letterX = x + swatch + Math.round(swatch * 0.45);
    return {
      letter: c.letter,
      hex: c.hex,
      count: c.count,
      swatch: sw,
      letterText: { text: c.letter, x: letterX, y: cy, size: legendSize, bold: true, color: INK, align: "left" },
      hexText: { text: c.hex, x: letterX + Math.round(legendSize * 1.9), y: cy, size: legendSize, color: INK, align: "left" },
      countText: { text: `${formatCount(c.count)} ${c.count === 1 ? "stitch" : "stitches"}`, x: letterX + Math.round(legendSize * 16.5), y: cy, size: legendSize, color: INK, align: "right" },
      yardsText: { text: `about ${yardsText(c.lowYards, c.highYards)}`, x: letterX + Math.round(legendSize * 28.5), y: cy, size: legendSize, color: INK, align: "right" },
    };
  });
  const legendBottom = entriesTop + perCol * rowH;
  const total: TextItem = {
    text: `Total: ${formatCount(model.total)} stitches (${model.cols} × ${model.rows})`,
    x: M,
    y: legendBottom + Math.round(24 * s) + legendSize * 0.5,
    size: legendSize,
    bold: true,
    color: INK,
    align: "left",
  };
  const yarnTotal: TextItem = {
    text: `Rough yarn estimate: about ${yardsText(model.lowYards, model.highYards)} in all`,
    x: M,
    y: total.y + Math.round(legendSize * 1.5),
    size: legendSize,
    bold: true,
    color: INK,
    align: "left",
  };
  const noteSize = Math.round(24 * s);
  const noteChars = Math.floor((width - 2 * M) / (noteSize * 0.6));
  let ny = yarnTotal.y + Math.round(legendSize * 1.3);
  const yarnNoteItems: TextItem[] = wrapText(yarnNote(model), noteChars).map((t) => {
    const item: TextItem = { text: t, x: M, y: ny, size: noteSize, color: MUTED, align: "left" };
    ny += Math.round(noteSize * 1.5);
    return item;
  });
  const height = Math.round(ny + M * 0.5);

  return { width, height, cellW, cellH, x0, y0, chartW, chartH, labelStep, showLetters, numberSize, letterSize, header, legendTitle, legend, total, yarnTotal, yarnNote: yarnNoteItems };
}

/** Work out the image: the largest stitch size whose picture stays within the pixel budget. */
export interface PngOptions {
  /** Print each stitch's color letter inside it. Off by default: clean color blocks. The legend always has the letters. */
  letters?: boolean;
}

export function layoutPng(model: PatternModel, options: PngOptions = {}): PngLayout {
  const letters = options.letters === true;
  for (const w of CELL_WIDTHS) {
    const l = build(model, w, letters);
    if (l.width * l.height <= PNG_LIMITS.maxPixels && Math.max(l.width, l.height) <= PNG_LIMITS.maxSide) return l;
  }
  return build(model, CELL_WIDTHS[CELL_WIDTHS.length - 1], letters);
}

function text(ctx: Ctx2D, t: TextItem): void {
  ctx.font = `${t.bold ? "bold " : ""}${t.size}px ${t.serif ? SERIF : SANS}`;
  ctx.fillStyle = t.color;
  ctx.textAlign = t.align;
  ctx.textBaseline = "middle";
  ctx.fillText(t.text, t.x, t.y);
}

/** Draw the whole pattern image from the stitch matrix. Never reads the picture or the screen. */
export function drawPng(ctx: Ctx2D, model: PatternModel, l: PngLayout): void {
  const { cols, rows, matrix } = model;
  const { cellW, cellH, x0, y0, chartW, chartH } = l;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, l.width, l.height);

  // Stitches: one solid rectangle each, in the exact color the matrix says.
  let current = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hex = model.hexOf[matrix.cells[r][c]];
      if (hex !== current) {
        ctx.fillStyle = hex;
        current = hex;
      }
      ctx.fillRect(x0 + c * cellW, y0 + r * cellH, cellW, cellH);
    }
  }

  // A letter in each stitch, so colors can be told apart on a black-and-white print or a color-blind screen.
  if (l.showLetters) {
    ctx.font = `bold ${l.letterSize}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let ink = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = matrix.cells[r][c];
        const color = inkOn(model.hexOf[idx]);
        if (color !== ink) {
          ctx.fillStyle = color;
          ink = color;
        }
        ctx.fillText(model.letterOf[idx] as string, x0 + c * cellW + cellW / 2, y0 + r * cellH + cellH / 2 + 1);
      }
    }
  }

  // Thin grid between stitches (mid-gray, so it shows on light and dark yarn).
  ctx.fillStyle = GRID;
  for (let c = 0; c <= cols; c++) ctx.fillRect(x0 + c * cellW - (c === cols ? 1 : 0), y0, 1, chartH);
  for (let r = 0; r <= rows; r++) ctx.fillRect(x0, y0 + r * cellH - (r === rows ? 1 : 0), chartW, 1);

  // A heavier line after every 10th stitch and 10th row (counted from the right and from the bottom): a white edge under a black core.
  for (let k = 10; k < cols; k += 10) {
    const c = cols - k;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x0 + c * cellW - 2, y0, 4, chartH);
    ctx.fillStyle = INK;
    ctx.fillRect(x0 + c * cellW - 1, y0, 2, chartH);
  }
  for (let k = 10; k < rows; k += 10) {
    const y = y0 + (rows - k) * cellH;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x0, y - 2, chartW, 4);
    ctx.fillStyle = INK;
    ctx.fillRect(x0, y - 1, chartW, 2);
  }

  // Border.
  ctx.fillStyle = INK;
  ctx.fillRect(x0 - 2, y0 - 2, chartW + 4, 2);
  ctx.fillRect(x0 - 2, y0 + chartH, chartW + 4, 2);
  ctx.fillRect(x0 - 2, y0 - 2, 2, chartH + 4);
  ctx.fillRect(x0 + chartW, y0 - 2, 2, chartH + 4);

  // Numbers on all four sides: columns across the top and bottom (1 at the right), rows down both sides (1 at the bottom).
  const sideX = Math.round(l.numberSize * 1.35);
  const sideY = Math.round(l.numberSize * 1.1);
  for (const n of labelNumbers(cols, l.labelStep)) {
    const x = x0 + (cols - n) * cellW + cellW / 2;
    const bold = n % 10 === 0;
    for (const y of [y0 - sideY, y0 + chartH + sideY]) text(ctx, { text: String(n), x, y, size: l.numberSize, bold, color: MUTED, align: "center" });
  }
  for (const n of labelNumbers(rows, l.labelStep)) {
    const y = y0 + (rows - n) * cellH + cellH / 2; // row n counted from the bottom
    const bold = n % 10 === 0;
    for (const x of [x0 - sideX, x0 + chartW + sideX]) text(ctx, { text: String(n), x, y, size: l.numberSize, bold, color: MUTED, align: "center" });
  }

  // Header and legend.
  l.header.forEach((t) => text(ctx, t));
  text(ctx, l.legendTitle);
  for (const e of l.legend) {
    ctx.fillStyle = INK;
    ctx.fillRect(e.swatch.x - 2, e.swatch.y - 2, e.swatch.size + 4, e.swatch.size + 4);
    ctx.fillStyle = e.hex;
    ctx.fillRect(e.swatch.x, e.swatch.y, e.swatch.size, e.swatch.size);
    text(ctx, e.letterText);
    text(ctx, e.hexText);
    text(ctx, e.countText);
    text(ctx, e.yardsText);
  }
  text(ctx, l.total);
  text(ctx, l.yarnTotal);
  l.yarnNote.forEach((t) => text(ctx, t));
}

/** The numbers printed for a stitch, exported so tests can tie a drawn label back to its stitch. */
export { stitchNumbers, STITCH_ASPECT };
