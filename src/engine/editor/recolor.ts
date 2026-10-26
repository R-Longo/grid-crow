import type { PaletteColor, StitchMatrix } from "../convert/types";

/**
 * Changing the yarn color of a palette slot. Every stitch that uses the slot changes with it (the stitches keep their
 * palette index; the palette entry has a new color). The matrix is not changed in place: a new matrix shares the cells.
 */
export type RecolorResult =
  | { ok: true; matrix: StitchMatrix; from: string; to: string }
  | { ok: false; reason: "invalid" | "duplicate" | "same" | "missing"; /** The slot that already has this color. */ slot?: number };

/** "#abc", "ABC", "#AABBCC" or "aabbcc" -> "#aabbcc"; anything else -> null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) return "#" + [...s].map((c) => c + c).join("").toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return "#" + s.toLowerCase();
  return null;
}

export function colorOf(hex: string): PaletteColor {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex };
}

export function withSlotColor(m: StitchMatrix, slot: number, hex: string): StitchMatrix {
  const palette = m.palette.slice();
  palette[slot] = colorOf(hex);
  return { ...m, palette };
}

export function recolorSlot(m: StitchMatrix, slot: number, input: string): RecolorResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= m.palette.length) return { ok: false, reason: "missing" };
  const hex = normalizeHex(input);
  if (!hex) return { ok: false, reason: "invalid" };
  const from = m.palette[slot].hex.toLowerCase();
  if (hex === from) return { ok: false, reason: "same" };
  const other = m.palette.findIndex((p, i) => i !== slot && p.hex.toLowerCase() === hex);
  if (other >= 0) return { ok: false, reason: "duplicate", slot: other };
  return { ok: true, matrix: withSlotColor(m, slot, hex), from, to: hex };
}

/** Stitches that use a palette slot (row-major positions as {col,row}). */
export function stitchesOfSlot(m: StitchMatrix, slot: number): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < m.rows; row++) {
    const cells = m.cells[row];
    for (let col = 0; col < m.cols; col++) if (cells[col] === slot) out.push({ col, row });
  }
  return out;
}

/** Most yarn colors a chart may hold (the starting colors plus any added while editing). */
export const MAX_PALETTE = 16;

export type AddColorResult =
  | { ok: true; matrix: StitchMatrix; hex: string; slot: number }
  | { ok: false; reason: "invalid" | "duplicate" | "full"; /** The slot that already has this color. */ slot?: number };

/** Add a new yarn color to the end of the palette. No stitch changes; the new slot is unused until painted. */
export function addColorSlot(m: StitchMatrix, input: string): AddColorResult {
  const hex = normalizeHex(input);
  if (!hex) return { ok: false, reason: "invalid" };
  if (m.palette.length >= MAX_PALETTE) return { ok: false, reason: "full" };
  const other = m.palette.findIndex((p) => p.hex.toLowerCase() === hex);
  if (other >= 0) return { ok: false, reason: "duplicate", slot: other };
  return { ok: true, matrix: { ...m, palette: [...m.palette, colorOf(hex)] }, hex, slot: m.palette.length };
}
