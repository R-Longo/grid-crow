import type { GridSpec } from "../geometry";
import { isDefaultGauge } from "../gauge";
import { cleanupMatrix } from "./cleanup";
import { labToRgb, rgbToLab, toHex } from "./color";
import { cropRect, physicalAspect } from "./crop";
import { bilateral } from "./smooth";
import { buildBins, choosePalette } from "./quantize";
import { flattenOnWhite, resampleArea } from "./resample";
import { stitchify } from "./stitchify";
import { ConversionError } from "./types";
import type { CropState, PaletteColor, Raster, StitchMatrix } from "./types";

/** Each stitch is analysed from a BLOCK × BLOCK patch of pixels before it is reduced to one color. */
export const BLOCK = 6;

/**
 * Picture + crop + chart specification  →  stitch matrix.
 *
 *  1. Flatten transparency onto white.
 *  2. Cut out the crop (physical aspect ratio of the finished size) and resample it to
 *     cols × BLOCK by rows × BLOCK pixels by area averaging. The chart dimensions come straight
 *     from the GridSpec; nothing is recalculated here.
 *  3. Smooth with an edge-preserving filter (Lab bilateral).
 *  4. Choose ≤ maxColors palette colors (deterministic weighted k-means, then a rescue step that
 *     gives a slot to a small but distinctive color such as bright eyes).
 *  5. Reduce every stitch footprint to one palette color (contrast-aware vote).
 *  6. Crochet-aware cleanup of stray single stitches, protecting small high-contrast details.
 *  7. Drop unused palette entries, so the matrix never holds more than maxColors colors.
 *
 * Deterministic: contains no randomness and no dependence on time or environment.
 */
export function convertRaster(raster: Raster, crop: CropState, spec: GridSpec): StitchMatrix {
  validateRaster(raster);
  const { cols, rows, maxColors } = spec;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
    throw new ConversionError("invalid-grid", "The chart size is not valid.");
  }
  if (!Number.isInteger(maxColors) || maxColors < 1) {
    throw new ConversionError("invalid-grid", "The maximum number of colors is not valid.");
  }

  const opaque = flattenOnWhite(raster);
  const rect = cropRect(raster.width, raster.height, physicalAspect(spec.widthInches, spec.heightInches), crop);
  const workW = cols * BLOCK;
  const workH = rows * BLOCK;
  const rgb = resampleArea(opaque, rect, workW, workH);

  const lab = new Float32Array(workW * workH * 3);
  for (let i = 0, p = 0; i < workW * workH; i++, p += 3) rgbToLab(rgb[p], rgb[p + 1], rgb[p + 2], lab, p);

  const smooth = bilateral(lab, workW, workH);
  const bins = buildBins(smooth);
  const cents = choosePalette(bins, maxColors, { lab: smooth, width: workW, height: workH });
  const k = cents.length / 3;

  const raw = stitchify(smooth, workW, cols, rows, BLOCK, cents, k);
  const cleaned = cleanupMatrix(raw, cents, k);
  const matrix = finalize(cleaned, cents, k);
  // A chart made at the person's own gauge remembers it; one at the standard gauge stays exactly as it always was.
  const g = { stitchesPerInch: spec.gauge.stitchesPerInch, rowsPerInch: spec.gauge.rowsPerInch };
  return isDefaultGauge(g) ? matrix : { ...matrix, gauge: g };
}

/** Remove unused/duplicate colors and order the palette by how many stitches use each color. */
function finalize(cells: number[][], cents: Float64Array, k: number): StitchMatrix {
  const rows = cells.length;
  const cols = cells[0].length;
  const hexOf: string[] = [];
  const rgbOf: Array<[number, number, number]> = [];
  for (let c = 0; c < k; c++) {
    const rgb = labToRgb(cents[c * 3], cents[c * 3 + 1], cents[c * 3 + 2]);
    rgbOf.push(rgb);
    hexOf.push(toHex(rgb[0], rgb[1], rgb[2]));
  }
  // Colors that round to the same hex are the same yarn: merge them.
  const canonical = hexOf.map((h) => hexOf.indexOf(h));
  const counts = new Array<number>(k).fill(0);
  for (const row of cells) for (const v of row) counts[canonical[v]]++;
  const used = counts.map((n, i) => ({ i, n })).filter((e) => e.n > 0);
  used.sort((a, b) => b.n - a.n || a.i - b.i);
  const remap = new Map<number, number>();
  const palette: PaletteColor[] = used.map((e, newIndex) => {
    remap.set(e.i, newIndex);
    const [r, g, b] = rgbOf[e.i];
    return { r, g, b, hex: hexOf[e.i] };
  });
  const out: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array<number>(cols);
    for (let c = 0; c < cols; c++) row[c] = remap.get(canonical[cells[r][c]]) as number;
    out.push(row);
  }
  return { cols, rows, palette, cells: out };
}

function validateRaster(r: Raster): void {
  if (
    !r ||
    !Number.isInteger(r.width) ||
    !Number.isInteger(r.height) ||
    r.width < 1 ||
    r.height < 1 ||
    !r.data ||
    r.data.length !== r.width * r.height * 4
  ) {
    throw new ConversionError(
      "invalid-raster",
      "That image couldn't be read. Please try a different JPG, PNG, or WebP file.",
    );
  }
}
