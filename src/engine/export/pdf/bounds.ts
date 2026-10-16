import { textWidth } from "./metrics";
import type { Op } from "./ops";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The area an instruction paints, including line thickness and text size. Used to prove nothing runs off a page. */
export function opBox(op: Op): Box {
  if (op.k === "rect") return { x0: op.x, y0: op.y, x1: op.x + op.w, y1: op.y + op.h };
  if (op.k === "line") {
    const h = op.w / 2;
    return { x0: Math.min(op.x1, op.x2) - h, y0: Math.min(op.y1, op.y2) - h, x1: Math.max(op.x1, op.x2) + h, y1: Math.max(op.y1, op.y2) + h };
  }
  const w = textWidth(op.s, op.size, op.bold);
  const shift = op.align === "center" ? w / 2 : op.align === "right" ? w : 0;
  if (op.rot === 90) {
    // reads upward: starts at (x, y - shift), ends w higher; glyphs rise toward -x
    return { x0: op.x - op.size * 0.95, y0: op.y - shift - w, x1: op.x + op.size * 0.25, y1: op.y - shift };
  }
  return { x0: op.x - shift, y0: op.y - op.size * 0.95, x1: op.x - shift + w, y1: op.y + op.size * 0.25 };
}
