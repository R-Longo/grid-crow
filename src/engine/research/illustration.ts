import type { GridSpec } from "../geometry";
import { deltaE, labToRgb, rgbToLab, toHex } from "../convert/color";
import { cropRect, physicalAspect } from "../convert/crop";
import { flattenOnWhite, resampleArea } from "../convert/resample";
import { ConversionError } from "../convert/types";
import type { CropState, PaletteColor, Raster, StitchMatrix } from "../convert/types";

/**
 * Illustration conversion: a separate pipeline for flat-color artwork (line art, icons, tarot-style
 * drawings). It shares the sizing engine and the stitch matrix with the photo converter and nothing else.
 *
 * Photo conversion averages and blends; this one treats the picture as a background plus a few flat
 * "ink" colors and asks, for every stitch, how much ink falls inside it.
 *
 *  1. Work at a resolution finer than the grid (BLOCK pixels per stitch), with no smoothing.
 *  2. Find the literal colors: flat pixels (no neighbour differs much) are the artist's colors; the blends
 *     that anti-aliasing puts between them are not colors and never get a palette slot.
 *  3. For each ink color, every pixel gets a coverage 0–1: how far along the way from the background to that
 *     ink it lies. Averaged over a stitch footprint that is the share of the stitch the ink fills.
 *  4. A stitch is ink where its coverage is high. A line thinner than a stitch only reaches a fraction of one,
 *     so it is also drawn where its coverage is a local ridge: the best stitch across the line. That draws
 *     one stitch per crossing, keeps the line connected along its length, and leaves a gap between two lines
 *     that are more than a stitch apart. Lines closer than a stitch share one ridge, so they merge: the
 *     stitch is the limit, not the algorithm.
 *  5. Only isolated specks of almost no ink are dropped. A lone stitch with real ink is a star or an eye.
 *
 * Deterministic: no randomness, no dependence on time or environment.
 */
export type LineWeight = "fine" | "medium" | "bold";

export const ILLUSTRATION = {
  /** Working pixels per stitch, each way. */
  block: 8,
  /** A pixel is "flat" when no 4-neighbour differs by more than this (Lab ΔE). */
  flatDE: 6,
  /** Flat colors closer than this to the background are the background. */
  bgDE: 14,
  /** Flat ink colors closer than this are one color. */
  inkMergeDE: 18,
  /** An ink color needs at least this share of the picture's pixels to get a slot. */
  minInkMass: 0.0002,
  /** Stitches with at least this much ink are ink outright. */
  solid: 0.4,
  /** Least ink (coverage) a ridge stitch needs, by line weight. Bolder weights draw fainter lines. */
  ridge: { fine: 0.2, medium: 0.14, bold: 0.09 } as Record<LineWeight, number>,
  /** An isolated stitch with less ink than this is dust. */
  speck: 0.1,
  /** Off by default: on this artwork the tint added a few pale stitches beside borders and little body to the rays. */
  tint: false,
  /** Soft tint for dense bundles of fine lines (rays, hatching): the stitch needs this much ink... */
  tintMin: 0.1,
  /** ...and the 3 × 3 stitches around it this much on average. The tint is the primary ink thinned to this share. */
  tintArea: 0.14,
  tintShare: 0.3,
  /** How far (Lab ΔE) a pixel may sit off the straight line between background and ink and still count. */
  offLine: 12,
};

interface Flat {
  l: number;
  a: number;
  b: number;
}

function leaderClusters(points: Flat[], radius: number): Array<{ l: number; a: number; b: number; n: number }> {
  // Deterministic leader clustering on a coarse grid of the points, most common first.
  const cell = 3;
  const bins = new Map<string, { l: number; a: number; b: number; n: number }>();
  for (const p of points) {
    const key = `${Math.round(p.l / cell)},${Math.round(p.a / cell)},${Math.round(p.b / cell)}`;
    const e = bins.get(key);
    if (e) {
      e.l += p.l;
      e.a += p.a;
      e.b += p.b;
      e.n++;
    } else bins.set(key, { l: p.l, a: p.a, b: p.b, n: 1 });
  }
  const sorted = [...bins.entries()].sort((x, y) => y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1)).map((e) => e[1]);
  const leaders: Array<{ l: number; a: number; b: number; n: number }> = [];
  for (const e of sorted) {
    const l = e.l / e.n;
    const a = e.a / e.n;
    const b = e.b / e.n;
    let home = -1;
    for (let i = 0; i < leaders.length; i++) {
      const d = Math.hypot(leaders[i].l - l, leaders[i].a - a, leaders[i].b - b);
      if (d <= radius) {
        home = i;
        break;
      }
    }
    if (home < 0) leaders.push({ l: e.l, a: e.a, b: e.b, n: e.n });
    else {
      leaders[home].l += e.l;
      leaders[home].a += e.a;
      leaders[home].b += e.b;
      leaders[home].n += e.n;
    }
  }
  return leaders.map((c) => ({ l: c.l / c.n, a: c.a / c.n, b: c.b / c.n, n: c.n }));
}

export interface IllustrationAnalysis {
  cols: number;
  rows: number;
  maxColors: number;
  /** Background and ink colors (Lab, with pixel counts). */
  bg: { l: number; a: number; b: number; n: number };
  inks: Array<{ l: number; a: number; b: number; n: number }>;
  /** Per ink: share (0-1) of each stitch footprint the ink fills. */
  cov: Float32Array[];
}

/** Steps 1-3 of the illustration pipeline: literal colors and per-stitch ink coverage. */
export function analyzeIllustration(raster: Raster, crop: CropState, spec: GridSpec): IllustrationAnalysis {
  if (!raster || raster.data.length !== raster.width * raster.height * 4 || raster.width < 1 || raster.height < 1) {
    throw new ConversionError("invalid-raster", "That image couldn't be read. Please try a different JPG, PNG, or WebP file.");
  }
  const { cols, rows, maxColors } = spec;
  const B = ILLUSTRATION.block;
  const W = cols * B;
  const H = rows * B;
  const rect = cropRect(raster.width, raster.height, physicalAspect(spec.widthInches, spec.heightInches), crop);
  const rgb = resampleArea(flattenOnWhite(raster), rect, W, H);
  const lab = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) rgbToLab(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], lab, i * 3);

  // --- literal colors -------------------------------------------------------------------------------
  const flat: Flat[] = [];
  const all: Flat[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const p = { l: lab[i * 3], a: lab[i * 3 + 1], b: lab[i * 3 + 2] };
      all.push(p);
      let isFlat = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && deltaE(lab, i * 3, lab, j * 3) > ILLUSTRATION.flatDE) {
          isFlat = false;
          break;
        }
      }
      if (isFlat) flat.push(p);
    }
  }
  const pool = flat.length > 0 ? flat : all;
  const clusters = leaderClusters(pool, ILLUSTRATION.inkMergeDE / 2);
  clusters.sort((x, y) => y.n - x.n);
  const bg = clusters[0];
  const bgLab = new Float64Array([bg.l, bg.a, bg.b]);
  const inkMass = ILLUSTRATION.minInkMass * W * H;
  let inks = clusters
    .slice(1)
    .filter((c) => c.n >= inkMass && Math.hypot(c.l - bg.l, c.a - bg.a, c.b - bg.b) > ILLUSTRATION.bgDE);
  // Thin lines with no flat pixels at all: fall back to the strongest non-flat pixels.
  if (inks.length === 0) {
    const far = all.filter((p) => Math.hypot(p.l - bg.l, p.a - bg.a, p.b - bg.b) > 30);
    inks = leaderClusters(far, ILLUSTRATION.inkMergeDE).sort((x, y) => y.n - x.n).filter((c) => c.n >= inkMass);
  }
  // Colors that are only blends of other colors are not colors: drop them (a blend lies on the line
  // between the background and a stronger ink).
  inks = inks.filter((c, idx) => {
    for (let j = 0; j < inks.length; j++) {
      if (j === idx) continue;
      const o = inks[j];
      const dx = o.l - bg.l;
      const dy = o.a - bg.a;
      const dz = o.b - bg.b;
      const len2 = dx * dx + dy * dy + dz * dz;
      const ex = c.l - bg.l;
      const ey = c.a - bg.a;
      const ez = c.b - bg.b;
      const t = (ex * dx + ey * dy + ez * dz) / len2;
      const off = Math.hypot(ex - t * dx, ey - t * dy, ez - t * dz);
      if (t > 0.1 && t < 0.9 && off < 8 && o.n >= c.n * 0.25) return false;
    }
    return true;
  });
  inks = inks.slice(0, Math.max(0, maxColors - 1));

  // --- coverage per stitch and ink -------------------------------------------------------------------
  const cov: Float32Array[] = [];
  for (const ink of inks) {
    const dx = ink.l - bgLab[0];
    const dy = ink.a - bgLab[1];
    const dz = ink.b - bgLab[2];
    const len2 = dx * dx + dy * dy + dz * dz;
    const c = new Float32Array(cols * rows);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const ex = lab[i] - bgLab[0];
        const ey = lab[i + 1] - bgLab[1];
        const ez = lab[i + 2] - bgLab[2];
        const t = (ex * dx + ey * dy + ez * dz) / len2;
        if (t <= 0 || t > 1.3) continue;
        if (Math.hypot(ex - t * dx, ey - t * dy, ez - t * dz) > ILLUSTRATION.offLine) continue;
        c[((y / B) | 0) * cols + ((x / B) | 0)] += Math.min(1, t);
      }
    }
    for (let i = 0; i < c.length; i++) c[i] /= B * B;
    cov.push(c);
  }

  return { cols, rows, maxColors, bg, inks, cov };
}

export function convertIllustration(
  raster: Raster,
  crop: CropState,
  spec: GridSpec,
  weight: LineWeight = "medium",
): StitchMatrix {
  const { cols, rows, maxColors, bg, inks, cov } = analyzeIllustration(raster, crop, spec);
  const k = inks.length;
  // --- decide each stitch ----------------------------------------------------------------------------
  const BG = -1;
  const pick = new Int16Array(cols * rows).fill(BG);
  const best = new Float32Array(cols * rows);
  for (let s = 0; s < cols * rows; s++) {
    let bi = -1;
    let bv = 0;
    for (let i = 0; i < k; i++) {
      if (cov[i][s] > bv) {
        bv = cov[i][s];
        bi = i;
      }
    }
    best[s] = bv;
    pick[s] = bi;
  }
  const ink = new Int16Array(cols * rows).fill(BG);
  const ridgeMin = ILLUSTRATION.ridge[weight];
  const at = (i: number, r: number, c: number) => (r < 0 || c < 0 || r >= rows || c >= cols ? 0 : cov[i][r * cols + c]);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = r * cols + c;
      const i = pick[s];
      if (i < 0) continue;
      const v = best[s];
      if (v >= ILLUSTRATION.solid) {
        ink[s] = i;
        continue;
      }
      if (v < ridgeMin) continue;
      // Beside a stroke that is already a stitch or more wide there is nothing to add (it would only fatten it).
      if (
        (r > 0 && cov[i][s - cols] >= ILLUSTRATION.solid) ||
        (r < rows - 1 && cov[i][s + cols] >= ILLUSTRATION.solid) ||
        (c > 0 && cov[i][s - 1] >= ILLUSTRATION.solid) ||
        (c < cols - 1 && cov[i][s + 1] >= ILLUSTRATION.solid)
      )
        continue;
      // Local maximum across the line, in either direction (ties: the earlier stitch wins).
      const horiz = v >= at(i, r, c - 1) && v > at(i, r, c + 1);
      const vert = v >= at(i, r - 1, c) && v > at(i, r + 1, c);
      if (horiz || vert) ink[s] = i;
    }
  }
  // Dust: an isolated stitch with almost no ink.
  const cleaned = Int16Array.from(ink);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = r * cols + c;
      if (ink[s] === BG || best[s] >= ILLUSTRATION.speck) continue;
      let alone = true;
      for (let dr = -1; dr <= 1 && alone; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if ((dr || dc) && rr >= 0 && cc >= 0 && rr < rows && cc < cols && ink[rr * cols + cc] !== BG) {
            alone = false;
            break;
          }
        }
      if (alone) cleaned[s] = BG;
    }
  }

  // Dense bundles of fine lines read as a pale body with lines in it. When a color slot is free, the
  // stitches between the lines of such a bundle take a tint: the main ink thinned to the share it covers.
  const TINT = ILLUSTRATION.tint && k > 0 && maxColors >= 3 ? 1 : 0;
  const tinted = new Uint8Array(cols * rows);
  if (TINT) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const s = r * cols + c;
        if (cleaned[s] !== BG || best[s] < ILLUSTRATION.tintMin) continue;
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) {
              sum += best[rr * cols + cc];
              n++;
            }
          }
        if (sum / n >= ILLUSTRATION.tintArea) tinted[s] = 1;
      }
    }
  }

  // --- assemble the matrix ---------------------------------------------------------------------------
  const tintColor = TINT
    ? {
        l: bg.l + ILLUSTRATION.tintShare * (inks[0].l - bg.l),
        a: bg.a + ILLUSTRATION.tintShare * (inks[0].a - bg.a),
        b: bg.b + ILLUSTRATION.tintShare * (inks[0].b - bg.b),
        n: 0,
      }
    : null;
  const colors = tintColor ? [bg, ...inks, tintColor] : [bg, ...inks];
  const TINT_INDEX = colors.length - 1; // index into `colors` (only used when tintColor exists)
  const hexes = colors.map((c) => {
    const [r, g, b] = labToRgb(c.l, c.a, c.b);
    return { r, g, b, hex: toHex(r, g, b) };
  });
  const counts = new Array<number>(colors.length).fill(0);
  for (let s = 0; s < cleaned.length; s++) {
    if (tintColor && tinted[s]) counts[TINT_INDEX]++;
    else counts[cleaned[s] + 1]++;
  }
  const order = colors.map((_, i) => i).filter((i) => counts[i] > 0 || i === 0);
  order.sort((x, y) => counts[y] - counts[x] || x - y);
  const remap = new Map<number, number>();
  const palette: PaletteColor[] = order.map((old, n) => {
    remap.set(old, n);
    return hexes[old];
  });
  const cells: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array<number>(cols);
    for (let c = 0; c < cols; c++) row[c] = remap.get(tintColor && tinted[r * cols + c] ? TINT_INDEX : cleaned[r * cols + c] + 1) as number;
    cells.push(row);
  }
  return { cols, rows, palette, cells };
}
