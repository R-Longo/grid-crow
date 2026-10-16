import type { StitchMatrix } from "../convert/types";
import type { Stitch } from "./coords";

/**
 * Undo history. Each entry is ONE user action (one brush stroke, or one fill) stored as the stitches it changed:
 * their positions and the color each had before and after. A whole-chart fill therefore costs about 6 bytes per
 * stitch, never a copy of the chart.
 */
export interface Edit {
  label: "paint" | "fill";
  /** row * cols + col of each changed stitch. */
  index: Uint32Array;
  before: Uint8Array;
  after: Uint8Array;
}

/** Build an edit from the stitches that changed between two charts of the same size. */
export function makeEdit(label: Edit["label"], stitches: Iterable<number | Stitch>, before: StitchMatrix, after: StitchMatrix): Edit {
  const cols = before.cols;
  const seen = new Set<number>();
  const idx: number[] = [];
  for (const s of stitches) {
    const i = typeof s === "number" ? s : s.row * cols + s.col;
    if (seen.has(i)) continue;
    seen.add(i);
    const r = (i / cols) | 0;
    if (before.cells[r][i - r * cols] !== after.cells[r][i - r * cols]) idx.push(i);
  }
  const index = Uint32Array.from(idx);
  const b = new Uint8Array(index.length);
  const a = new Uint8Array(index.length);
  index.forEach((i, k) => {
    const r = (i / cols) | 0;
    b[k] = before.cells[r][i - r * cols];
    a[k] = after.cells[r][i - r * cols];
  });
  return { label, index, before: b, after: a };
}

/** Apply an edit forwards ("redo") or backwards ("undo"). Returns a new matrix and the stitches touched. */
export function applyEdit(m: StitchMatrix, e: Edit, direction: "undo" | "redo"): { matrix: StitchMatrix; stitches: Stitch[] } {
  const cols = m.cols;
  const values = direction === "undo" ? e.before : e.after;
  const cells = m.cells.slice();
  const copied = new Set<number>();
  const stitches: Stitch[] = [];
  for (let k = 0; k < e.index.length; k++) {
    const i = e.index[k];
    const row = (i / cols) | 0;
    const col = i - row * cols;
    if (!copied.has(row)) {
      cells[row] = cells[row].slice();
      copied.add(row);
    }
    cells[row][col] = values[k];
    stitches.push({ col, row });
  }
  return { matrix: { cols: m.cols, rows: m.rows, palette: m.palette, cells }, stitches };
}

/** Does the chart currently hold what the edit expects to find (all "after" values for undo, "before" for redo)? */
export function editMatches(m: StitchMatrix, e: Edit, direction: "undo" | "redo"): boolean {
  const expect = direction === "undo" ? e.after : e.before;
  for (let k = 0; k < e.index.length; k++) {
    const row = (e.index[k] / m.cols) | 0;
    if (m.cells[row][e.index[k] - row * m.cols] !== expect[k]) return false;
  }
  return true;
}

export const HISTORY_LIMITS = {
  /** Most actions kept. */
  maxActions: 500,
  /** Most changed stitches kept in total across all actions (about 6 MB). The oldest actions go first. */
  maxStitches: 1_000_000,
};

export class History {
  private done: Edit[] = [];
  private undone: Edit[] = [];
  private stitches = 0;

  constructor(private readonly limits = HISTORY_LIMITS) {}

  get canUndo(): boolean {
    return this.done.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }
  get size(): number {
    return this.done.length;
  }

  /** Record a new action. A new action ends any redo chain. Empty edits are ignored. */
  push(e: Edit): void {
    if (e.index.length === 0) return;
    this.undone = [];
    this.done.push(e);
    this.stitches += e.index.length;
    while (this.done.length > 1 && (this.done.length > this.limits.maxActions || this.stitches > this.limits.maxStitches)) {
      this.stitches -= (this.done.shift() as Edit).index.length;
    }
  }

  /** Take the most recent action off the done list (for undoing). */
  popUndo(): Edit | null {
    const e = this.done.pop();
    if (!e) return null;
    this.stitches -= e.index.length;
    this.undone.push(e);
    return e;
  }

  /** Take the most recently undone action (for redoing). */
  popRedo(): Edit | null {
    const e = this.undone.pop();
    if (!e) return null;
    this.done.push(e);
    this.stitches += e.index.length;
    return e;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this.stitches = 0;
  }
}
