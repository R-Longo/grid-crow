/**
 * The drawing instructions a PDF page is made of. Layouts produce these (top-left origin, points, 72 per inch, y grows
 * downward), tests read them, and the writer turns them into PDF operators. Keeping the instructions as plain data is
 * what lets the tests check every stitch, line and number without a PDF viewer.
 */
export interface RectOp {
  k: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** "#RRGGBB" */
  fill: string;
  tag?: string;
}

export interface LineOp {
  k: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Line width in points. */
  w: number;
  color: string;
  tag?: string;
}

export interface TextOp {
  k: "text";
  /** Anchor: left, centre or right end of the text, on its baseline. */
  x: number;
  y: number;
  s: string;
  size: number;
  bold?: boolean;
  color: string;
  align?: "left" | "center" | "right";
  /** 90 = reading upward (used for the side notes). */
  rot?: 0 | 90;
  tag?: string;
}

export type Op = RectOp | LineOp | TextOp;

export interface PdfPage {
  width: number;
  height: number;
  ops: Op[];
  /** What the page is, for tests and for people reading the code. Not written to the file. */
  meta?: Record<string, unknown>;
}

export interface PdfDoc {
  title: string;
  pages: PdfPage[];
}

/** US Letter, in points. */
export const LETTER = { width: 612, height: 792 };
