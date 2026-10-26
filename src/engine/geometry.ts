import { REFERENCE_GAUGE } from "../config/gauge";
import type { ReferenceGauge } from "../config/gauge";
import { FINISHED_SIZES } from "../config/sizes";
import type { FinishedSizeId } from "../config/sizes";
import type { MaxColors, Orientation, SetupSettings } from "../types";
import { stitchesForSize } from "./gauge";

/**
 * The single description of the chart the user asked for. The setup screen displays it
 * and the Stage 3 converter will consume it, so stitch counts are calculated in exactly
 * one place (buildGridSpec below). One grid cell = one single crochet stitch = one solid color.
 */
export interface GridSpec {
  /** Selected size preset (portrait listing, e.g. "12x16"), or "custom" for a size typed in Manual Mode. */
  sizeId: FinishedSizeId | "custom";
  orientation: Orientation;
  /** Approximate finished width in inches (already reversed for landscape). */
  widthInches: number;
  /** Approximate finished height in inches. */
  heightInches: number;
  /** Stitches across (grid columns). Always a whole number. */
  cols: number;
  /** Rows high (grid rows). Always a whole number. */
  rows: number;
  /** Reference gauge the counts were calculated from. */
  gauge: ReferenceGauge;
  /** Maximum number of yarn colors in the palette. */
  maxColors: MaxColors;
}

/** Finished width × height in inches for a size and orientation (landscape reverses them). */
export function finishedDimensions(
  sizeId: FinishedSizeId,
  orientation: Orientation,
): { widthInches: number; heightInches: number } {
  const size = FINISHED_SIZES.find((s) => s.id === sizeId);
  if (!size) throw new Error(`Unknown finished size: ${sizeId}`);
  return orientation === "portrait"
    ? { widthInches: size.width, heightInches: size.height }
    : { widthInches: size.height, heightInches: size.width };
}

/**
 * Build the chart specification from the current selections.
 *   cols = round(physical width  × stitches per inch)
 *   rows = round(physical height × rows per inch)
 * Landscape reverses the PHYSICAL dimensions first and then applies the gauge, so
 * landscape grids are recalculated, never transposed from portrait stitch counts.
 */
export function buildGridSpec(
  settings: SetupSettings,
  gauge: ReferenceGauge = REFERENCE_GAUGE,
): GridSpec {
  if (settings.sizeId === "custom") {
    const c = settings.custom;
    if (!c) throw new Error("A custom size needs its measurements");
    const g = { stitchesPerInch: c.stitchesPerInch, rowsPerInch: c.rowsPerInch };
    const { cols, rows } = stitchesForSize(c.widthInches, c.heightInches, g);
    return {
      sizeId: "custom",
      orientation: settings.orientation,
      // What the whole stitches really make, so the picture is cropped to the proportions of the stitches.
      widthInches: cols / g.stitchesPerInch,
      heightInches: rows / g.rowsPerInch,
      cols,
      rows,
      gauge: { yarnLabel: "your own yarn", hookLabel: "your own hook", ...g },
      maxColors: settings.maxColors,
    };
  }
  const { widthInches, heightInches } = finishedDimensions(settings.sizeId, settings.orientation);
  return {
    sizeId: settings.sizeId,
    orientation: settings.orientation,
    widthInches,
    heightInches,
    cols: Math.round(widthInches * gauge.stitchesPerInch),
    rows: Math.round(heightInches * gauge.rowsPerInch),
    gauge,
    maxColors: settings.maxColors,
  };
}

/** "12 × 16 inches" */
export function formatFinishedSize(spec: GridSpec): string {
  return `${spec.widthInches} × ${spec.heightInches} inches`;
}

/** "48 stitches × 72 rows" */
export function formatStitchGrid(spec: GridSpec): string {
  return `${spec.cols} stitches × ${spec.rows} rows`;
}
