/** Raw pixels: 4 bytes per pixel (R, G, B, A), row-major. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Which part of the picture to keep.
 * zoom 1 = the largest region that fits the tapestry's physical aspect ratio;
 * higher zoom = a smaller region. cx / cy are the region's centre as a fraction (0–1)
 * of the picture's width / height.
 */
export interface CropState {
  zoom: number;
  cx: number;
  cy: number;
}

/** A region of the source picture, in source pixels (may be fractional). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
  /** "#rrggbb" */
  hex: string;
}

/**
 * The finished chart: one palette index for every stitch.
 * cells[row][col] is an index into palette. This is the source of truth;
 * anything drawn on screen is rendered FROM it, never the other way round.
 */
export interface StitchMatrix {
  cols: number;
  rows: number;
  palette: PaletteColor[];
  cells: number[][];
  /** The person's own gauge, when they set one. Absent means the standard gauge. */
  gauge?: { stitchesPerInch: number; rowsPerInch: number };
}

export type ConversionErrorCode =
  | "unsupported-type"
  | "empty-file"
  | "too-large"
  | "corrupt-image"
  | "invalid-raster"
  | "invalid-grid";

/** An error with a message that is safe to show to the user. */
export class ConversionError extends Error {
  readonly code: ConversionErrorCode;
  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.name = "ConversionError";
    this.code = code;
  }
}
