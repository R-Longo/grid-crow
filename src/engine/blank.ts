import { isDefaultGauge } from "./gauge";
import type { PaletteColor, StitchMatrix } from "./convert/types";

/**
 * Blank Canvas: a chart with no picture behind it. It is an ordinary StitchMatrix (every stitch holds a palette index),
 * so the same editor and the same PNG and PDF exports work on it.
 *
 * The palette is ten fixed slots (the converter never makes more than ten colors either). Slot 0 is the white background
 * every stitch starts in. All ten can be changed by the person; unused slots simply do not appear in an export.
 */
export const STARTER_HEXES = [
  "#ffffff", // white (the background)
  "#111111", // black
  "#d62828", // red
  "#1f5fbf", // blue
  "#2e9e4f", // green
  "#f7d21e", // yellow
  "#f28c28", // orange
  "#7a4a2b", // brown
  "#bfbfbf", // light gray
  "#5a5a5a", // dark gray
] as const;

export const BLANK_BACKGROUND_SLOT = 0;
/** The color the brush starts with, so the canvas is ready to draw on straight away. */
export const BLANK_START_COLOR = 1;

export function toPaletteColor(hex: string): PaletteColor {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex };
}

export function starterPalette(): PaletteColor[] {
  return STARTER_HEXES.map(toPaletteColor);
}

/** A white chart of the given size. Every row is its own array. */
export function makeBlankMatrix(cols: number, rows: number, gauge?: { stitchesPerInch: number; rowsPerInch: number }): StitchMatrix {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new RangeError("a chart needs a whole number of stitches and rows");
  }
  const m: StitchMatrix = { cols, rows, palette: starterPalette(), cells: Array.from({ length: rows }, () => new Array<number>(cols).fill(BLANK_BACKGROUND_SLOT)) };
  return gauge && !isDefaultGauge(gauge) ? { ...m, gauge } : m;
}
