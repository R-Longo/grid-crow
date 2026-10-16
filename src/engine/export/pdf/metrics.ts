/**
 * Character widths of the two standard PDF fonts used (Helvetica and Helvetica-Bold), in 1/1000 of the font size.
 * Standard fonts are built into every PDF viewer and printer, so the file needs no embedded font. Knowing the widths lets
 * the layout centre and right-align text and wrap lines without ever measuring in a browser.
 * Covers printable ASCII plus the few other characters GridCrow prints (× – — ·).
 */
const REGULAR =
  "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " + // space ! " # $ % & ' ( ) * + , - . /
  "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 " + // 0-9 : ; < = > ?
  "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 " + // @ A-O
  "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 " + // P-Z [ \ ] ^ _
  "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 " + // ` a-o
  "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"; // p-z { | } ~
const BOLD =
  "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " +
  "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 " +
  "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 " +
  "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 " +
  "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 " +
  "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584";

const parse = (s: string) => s.split(" ").map(Number);
const W_REGULAR = parse(REGULAR);
const W_BOLD = parse(BOLD);

/** Width of one character (1000 = the font size). */
function charWidth(ch: string, bold: boolean): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REGULAR)[code - 32];
  if (ch === "×") return 584;
  if (ch === "–" || ch === "—") return ch === "–" ? 556 : 1000;
  if (ch === "·") return bold ? 278 : 278;
  return 556;
}

/** Width in points of `text` set in Helvetica (or Helvetica-Bold) at `size` points. */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

/** Break text into lines no wider than `maxWidth` points, at spaces (a single over-long word stays whole). */
export function wrapToWidth(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? line + " " + word : word;
    if (line && textWidth(next, size, bold) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
