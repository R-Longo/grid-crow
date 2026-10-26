// The eight approximate finished tapestry sizes offered in V1.
//
// Dimensions are PORTRAIT: width × height in inches. Landscape simply reverses
// width and height, and the stitch grid is then recalculated from the gauge
// (it is NOT a transposed portrait grid, because stitches and rows per inch differ).
//
// To add, remove, or change a size, edit this list only.

export const FINISHED_SIZES = [
  { id: "6x8", width: 6, height: 8 },
  { id: "8x10", width: 8, height: 10 },
  { id: "9x16", width: 9, height: 16 },
  { id: "12x12", width: 12, height: 12 },
  { id: "12x16", width: 12, height: 16 },
  { id: "16x20", width: 16, height: 20 },
  { id: "18x24", width: 18, height: 24 },
  { id: "24x32", width: 24, height: 32 },
] as const;

export type FinishedSizeId = (typeof FINISHED_SIZES)[number]["id"];

export const DEFAULT_SIZE_ID: FinishedSizeId = "12x16";
