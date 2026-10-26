/**
 * Stitch fonts: letters drawn on a grid, one square = one stitch. Two hand-built designs:
 *  - "standard": 5 stitches wide, 7 rows tall (most letters), for titles and labels.
 *  - "mini": 3 wide, 5 tall (M and W are 5 wide), for small captions. Legible, but only just.
 * Both are capitals and digits with the common punctuation; lowercase letters print as capitals.
 */
export type FontId = "standard" | "mini";

type Glyph = string[]; // rows top to bottom, "#" = stitch, "." = empty; all rows the same width

const STANDARD: Record<string, Glyph> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "##..#", "#.#.#", "#..##", "#..##", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": ["..", "..", "..", "..", "..", ".#", "#."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "-": ["...", "...", "...", "###", "...", "...", "..."],
  ":": [".", "#", ".", ".", ".", "#", "."],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": [".#", "#.", "#.", "#.", "#.", "#.", ".#"],
  ")": ["#.", ".#", ".#", ".#", ".#", ".#", "#."],
};

const MINI: Record<string, Glyph> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".#.", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "##."],
  ".": [".", ".", ".", ".", "#"],
  ",": ["..", "..", "..", ".#", "#."],
  "!": ["#", "#", "#", ".", "#"],
  "?": ["##.", "..#", ".#.", "...", ".#."],
  "-": ["...", "...", "###", "...", "..."],
  ":": [".", "#", ".", "#", "."],
  "'": ["#", "#", ".", ".", "."],
};

const FONTS: Record<FontId, { glyphs: Record<string, Glyph>; height: number; spaceW: number; lineGap: number }> = {
  standard: { glyphs: STANDARD, height: 7, spaceW: 3, lineGap: 2 },
  mini: { glyphs: MINI, height: 5, spaceW: 2, lineGap: 1 },
};

export const MAX_TEXT_LENGTH = 60;
export const MAX_TEXT_LINES = 4;

export interface TextStyle {
  font: FontId;
  /** Whole-number enlargement: each font stitch becomes scale x scale stitches. */
  scale: number;
  /** Thicker strokes: every letter is drawn twice, one font stitch apart. */
  bold: boolean;
}

export interface TextMask {
  width: number;
  height: number;
  /** rows[y][x] is true where a stitch is part of a letter. */
  rows: boolean[][];
  /** Characters that could not be drawn and were shown as "?". */
  substituted: number;
}

/** The characters the fonts can draw (everything else shows as "?"). Lowercase letters are drawn as capitals. */
export function supports(ch: string): boolean {
  return ch === " " || ch === "\n" || ch.toUpperCase() in STANDARD;
}

function glyphFor(font: FontId, ch: string): { glyph: Glyph; substituted: boolean } {
  const g = FONTS[font].glyphs[ch.toUpperCase()];
  if (g) return { glyph: g, substituted: false };
  return { glyph: FONTS[font].glyphs["?"], substituted: true };
}

/** Draw one line (no line breaks) into rows of the font's own height, before enlarging. */
function renderLine(line: string, style: TextStyle): { rows: boolean[][]; substituted: number } {
  const F = FONTS[style.font];
  const rows: boolean[][] = Array.from({ length: F.height }, () => []);
  let x = 0;
  let substituted = 0;
  const put = (r: number, c: number) => {
    while (rows[r].length <= c) rows[r].push(false);
    rows[r][c] = true;
  };
  [...line].forEach((ch, i) => {
    if (i > 0) x += 1; // one empty stitch between letters
    if (ch === " ") {
      x += F.spaceW;
      return;
    }
    const { glyph, substituted: sub } = glyphFor(style.font, ch);
    if (sub) substituted++;
    const w = glyph[0].length;
    for (let r = 0; r < F.height; r++)
      for (let c = 0; c < w; c++)
        if (glyph[r][c] === "#") {
          put(r, x + c);
          if (style.bold) put(r, x + c + 1);
        }
    x += w + (style.bold ? 1 : 0);
  });
  return { rows, substituted };
}

/**
 * Turn text into a mask of stitches. Lines are centred on each other. Returns null for empty text.
 * The mask is as large as the text needs, so the caller can tell whether it fits the chart.
 */
export function renderText(text: string, style: TextStyle): TextMask | null {
  const clean = text.slice(0, MAX_TEXT_LENGTH).split("\n").slice(0, MAX_TEXT_LINES);
  while (clean.length && clean[clean.length - 1].trim() === "") clean.pop();
  if (clean.length === 0 || clean.every((l) => l.trim() === "")) return null;
  const F = FONTS[style.font];
  const s = Math.max(1, Math.floor(style.scale));
  const lines = clean.map((l) => renderLine(l.replace(/\s+$/, ""), style));
  const widths = lines.map((l) => Math.max(0, ...l.rows.map((r) => r.length)));
  const maxW = Math.max(...widths);
  const lineH = F.height;
  const totalH = lines.length * lineH + (lines.length - 1) * F.lineGap;
  const W = maxW * s;
  const H = totalH * s;
  const rows: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
  let substituted = 0;
  lines.forEach((l, li) => {
    substituted += l.substituted;
    const offX = Math.floor((maxW - widths[li]) / 2);
    const offY = li * (lineH + F.lineGap);
    l.rows.forEach((row, r) =>
      row.forEach((on, c) => {
        if (!on) return;
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) rows[(offY + r) * s + dy][(offX + c) * s + dx] = true;
      }),
    );
  });
  return { width: W, height: H, rows, substituted };
}

/** The stitches of a mask placed with its top-left corner at (col, row), as chart positions. */
export function maskStitches(mask: TextMask, col: number, row: number): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  mask.rows.forEach((r, y) => r.forEach((on, x) => on && out.push({ col: col + x, row: row + y })));
  return out;
}

/** Keep a mask of this size fully inside a chart: the nearest top-left corner that fits, or null when it is too big. */
export function clampPlacement(mask: TextMask, col: number, row: number, cols: number, rows: number): { col: number; row: number } | null {
  if (mask.width > cols || mask.height > rows) return null;
  return { col: Math.min(Math.max(0, col), cols - mask.width), row: Math.min(Math.max(0, row), rows - mask.height) };
}

/** The top-left corner that puts the middle of the mask on a stitch. */
export function centeredOn(mask: TextMask, col: number, row: number): { col: number; row: number } {
  return { col: col - Math.floor(mask.width / 2), row: row - Math.floor(mask.height / 2) };
}

/**
 * Break text into lines at spaces so each line fits in maxWidth stitches. Lines the person typed are kept; a single
 * word wider than the chart stays on its own line (the caller reports it as too big).
 */
export function wrapToWidth(text: string, style: TextStyle, maxWidth: number): string {
  const widthOf = (line: string) => renderText(line, style)?.width ?? 0;
  const out: string[] = [];
  for (const raw of text.slice(0, MAX_TEXT_LENGTH).split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (line && widthOf(tryLine) > maxWidth) {
        out.push(line);
        line = word;
      } else line = tryLine;
    }
    out.push(line);
  }
  return out.slice(0, MAX_TEXT_LINES).join("\n");
}
