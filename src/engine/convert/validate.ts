import type { GridSpec } from "../geometry";
import type { StitchMatrix } from "./types";

/**
 * Checks a stitch matrix against the Stage 2 chart specification.
 * Returns a list of problems (empty = valid). Used by tests now, and by editing in Stage 4.
 */
export function validateMatrix(m: StitchMatrix, spec: GridSpec): string[] {
  const problems: string[] = [];
  if (m.cols !== spec.cols) problems.push(`columns ${m.cols} ≠ ${spec.cols}`);
  if (m.rows !== spec.rows) problems.push(`rows ${m.rows} ≠ ${spec.rows}`);
  if (m.cells.length !== spec.rows) problems.push(`matrix has ${m.cells.length} rows, expected ${spec.rows}`);
  if (m.palette.length < 1) problems.push("palette is empty");
  if (m.palette.length > spec.maxColors) problems.push(`palette has ${m.palette.length} colors, max ${spec.maxColors}`);
  m.palette.forEach((p, i) => {
    const ok = [p.r, p.g, p.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
    if (!ok || !/^#[0-9a-f]{6}$/.test(p.hex)) problems.push(`palette color ${i} is not a solid opaque color`);
  });
  const used = new Set<number>();
  m.cells.forEach((row, r) => {
    if (row.length !== spec.cols) problems.push(`row ${r} has ${row.length} stitches, expected ${spec.cols}`);
    row.forEach((v, c) => {
      if (!Number.isInteger(v) || v < 0 || v >= m.palette.length) problems.push(`stitch (${c}, ${r}) has invalid color ${v}`);
      else used.add(v);
    });
  });
  if (used.size > spec.maxColors) problems.push(`${used.size} colors in use, max ${spec.maxColors}`);
  return problems.slice(0, 20);
}
