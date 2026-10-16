import type { GridSpec } from "../geometry";
import { deltaE, rgbToLab } from "../convert/color";
import { convertRaster } from "../convert/convert";
import { convertIllustration } from "./illustration";
import type { LineWeight } from "./illustration";
import type { CropState, Raster, StitchMatrix } from "../convert/types";

/**
 * EXPERIMENT (not wired to the app): the photo converter stays the foundation, and linework the photo
 * path lost is put back, only where the picture really is a drawing and only on stitches the photo path
 * gave to the field color.
 *
 * The line-art converter is run beside it, purely as a detector: it says which stitches hold a thin
 * ink line. Its output is never used wholesale. A stitch changes only when ALL of these hold:
 *
 *  - image gate: the picture is mostly one plain background (a drawing, not a photograph or painting);
 *  - the photo path colored that stitch as field (never overwrite something the photo path drew);
 *  - the line's ink is a color the photo palette already has (no new colors, so the limit holds);
 *  - the line touches linework that already exists (an existing ink stitch, or another restored
 *    stitch): it extends and reconnects lines, it never starts new blobs in empty field;
 *  - it would not fill a delicate gap: no 2 × 2 block of ink results, and no more than two of its
 *    four neighbours are ink.
 */
export const HYBRID = {
  /** Least share of stitches the line-art converter must call background for the picture to count as a drawing. */
  minBgShare: 0.55,
  /** Most share of stitches that may be line-art ink (a flat illustration is mostly fills, not lines). */
  maxInkShare: 0.35,
  /** Least share of the line-art ink that must be line-like (thin strokes) rather than filled areas. */
  minThin: 0.4,
  /** Nearest photo palette color must be this close (Lab ΔE) to the line's ink. */
  paletteReach: 30,
  /** A restored stitch may have at most this many ink 4-neighbours. */
  maxInkNeighbours: 2,
  /** How many passes of "touches existing linework" growth. */
  growPasses: 6,
  /** Ink must be at least this much darker or different (ΔE) from the field. */
  minContrast: 25,
};

export interface HybridInfo {
  matrix: StitchMatrix;
  applied: boolean;
  /** Why the overlay did nothing, or how many stitches it changed. */
  reason: string;
  changed: number;
  bgShare: number;
  inkShare: number;
  /** Share of line-art ink stitches that are line-like (at most 4 of 8 neighbours also ink). */
  thin: number;
}

function labOf(p: { r: number; g: number; b: number }): [number, number, number] {
  const out = new Float32Array(3);
  rgbToLab(p.r, p.g, p.b, out, 0);
  return [out[0], out[1], out[2]];
}

export function convertHybridDetailed(
  raster: Raster,
  crop: CropState,
  spec: GridSpec,
  weight: LineWeight = "bold",
): HybridInfo {
  const photo = convertRaster(raster, crop, spec);
  const line = convertIllustration(raster, crop, spec, weight);
  const { cols, rows } = photo;
  const total = cols * rows;

  // Line-art counts: its background is its most used color (palette index 0).
  const lineCount = new Array<number>(line.palette.length).fill(0);
  for (const row of line.cells) for (const v of row) lineCount[v]++;
  const bgShare = lineCount[0] / total;
  const inkShare = 1 - bgShare;
  let inkN = 0;
  let thinN = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (line.cells[r][c] === 0) continue;
      inkN++;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if ((dr || dc) && rr >= 0 && cc >= 0 && rr < rows && cc < cols && line.cells[rr][cc] !== 0) n++;
        }
      if (n <= 4) thinN++;
    }
  const thin = inkN ? thinN / inkN : 0;
  const base = { matrix: photo, applied: false, changed: 0, bgShare, inkShare, thin };
  if (line.palette.length < 2) return { ...base, reason: "no ink found" };
  if (bgShare < HYBRID.minBgShare) return { ...base, reason: "not a drawing (background share too low)" };
  if (inkShare > HYBRID.maxInkShare) return { ...base, reason: "not a drawing (too much ink)" };
  if (thin < HYBRID.minThin) return { ...base, reason: "not a drawing (ink is filled areas, not lines)" };

  // Map each line-art ink to the photo palette.
  const photoLab = photo.palette.map(labOf);
  const bgLab = labOf(line.palette[0]);
  const mapTo = new Array<number>(line.palette.length).fill(-1);
  for (let i = 1; i < line.palette.length; i++) {
    const l = labOf(line.palette[i]);
    let bi = -1;
    let bd = Infinity;
    for (let p = 0; p < photoLab.length; p++) {
      const d = Math.hypot(photoLab[p][0] - l[0], photoLab[p][1] - l[1], photoLab[p][2] - l[2]);
      if (d < bd) {
        bd = d;
        bi = p;
      }
    }
    const contrast = Math.hypot(l[0] - bgLab[0], l[1] - bgLab[1], l[2] - bgLab[2]);
    if (bd <= HYBRID.paletteReach && contrast >= HYBRID.minContrast) mapTo[i] = bi;
  }

  // The photo path's field color: the palette color nearest the line-art background.
  let field = 0;
  let fd = Infinity;
  for (let p = 0; p < photoLab.length; p++) {
    const d = Math.hypot(photoLab[p][0] - bgLab[0], photoLab[p][1] - bgLab[1], photoLab[p][2] - bgLab[2]);
    if (d < fd) {
      fd = d;
      field = p;
    }
  }
  // A stitch "is field" if the photo path gave it a color close to the background (the field and its tints).
  const isFieldColor = photo.palette.map((_, p) => deltaE(new Float64Array(photoLab[p]), 0, new Float64Array(bgLab), 0) < 18 || p === field);

  const cells = photo.cells.map((r) => r.slice());
  const isInk = (r: number, c: number) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return false;
    return !isFieldColor[cells[r][c]];
  };
  const candidate = new Int16Array(total).fill(-1);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const li = line.cells[r][c];
      if (li === 0 || mapTo[li] < 0) continue;
      if (!isFieldColor[photo.cells[r][c]]) continue;
      candidate[r * cols + c] = mapTo[li];
    }

  let changed = 0;
  for (let pass = 0; pass < HYBRID.growPasses; pass++) {
    const accepted: Array<[number, number, number]> = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const want = candidate[r * cols + c];
        if (want < 0) continue;
        // touches linework that already exists
        let touches = false;
        for (let dr = -1; dr <= 1 && !touches; dr++)
          for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && isInk(r + dr, c + dc)) touches = true;
        if (!touches) continue;
        // does not fill a gap
        const n4 = +isInk(r - 1, c) + +isInk(r + 1, c) + +isInk(r, c - 1) + +isInk(r, c + 1);
        if (n4 > HYBRID.maxInkNeighbours) continue;
        let block = false;
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
          if (isInk(r + dr, c) && isInk(r, c + dc) && isInk(r + dr, c + dc)) block = true;
        }
        if (block) continue;
        accepted.push([r, c, want]);
      }
    if (!accepted.length) break;
    for (const [r, c, want] of accepted) {
      cells[r][c] = want;
      candidate[r * cols + c] = -1;
      changed++;
    }
  }

  return {
    matrix: { cols, rows, palette: photo.palette, cells },
    applied: true,
    reason: `restored ${changed} stitches`,
    changed,
    bgShare,
    inkShare,
    thin,
  };
}

export function convertHybrid(raster: Raster, crop: CropState, spec: GridSpec, weight: LineWeight = "bold"): StitchMatrix {
  return convertHybridDetailed(raster, crop, spec, weight).matrix;
}
