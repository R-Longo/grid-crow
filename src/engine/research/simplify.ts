import type { GridSpec } from "../geometry";
import { labToRgb, toHex } from "../convert/color";
import { analyzeIllustration } from "./illustration";
import type { CropState, PaletteColor, Raster, StitchMatrix } from "../convert/types";

/**
 * EXPERIMENT (not wired to the app): deliberate simplification for detailed linework.
 *
 * A grid this coarse cannot hold every hairline, and trying to keep all of them leaves speckle. This
 * decides, per stitch, whether the picture is showing a LINE or a TONE there:
 *
 *  - Sparse area (few lines nearby): a bold line, one stitch per crossing, so lines stay connected.
 *  - Dense area (hatching, ray bundles, flower heads): the lines would only make noise, so the area
 *    becomes a flat mid-tone of the ink color, in two levels, with the strongest strokes still drawn
 *    as ink on top. Many hairlines read as a shaded patch instead of a scatter of dots.
 *
 * Tones are extra palette colors (the ink thinned toward the background), only used when the color
 * limit leaves room for them.
 */
export const SIMPLIFY = {
  /** A stitch with at least this much ink is a stroke (drawn as ink everywhere). */
  solid: 0.45,
  /** Least ink for a bold line stitch in a sparse area. */
  ridge: 0.09,
  /** Mean ink share over the 5 × 5 stitches around that makes an area "dense". */
  denseArea: 0.2,
  /** In a dense area a stitch needs at least this much ink (or a dense neighbourhood) to take a tone. */
  toneMin: 0.06,
  /** Tone levels as shares of the ink color: [light, medium]. */
  tones: [0.28, 0.55] as [number, number],
  /** Density at which the medium tone takes over from the light one. */
  mediumArea: 0.32,
};

export function convertSimplified(raster: Raster, crop: CropState, spec: GridSpec): StitchMatrix {
  const { cols, rows, maxColors, bg, inks, cov } = analyzeIllustration(raster, crop, spec);
  const total = cols * rows;
  const BG = -1;
  const k = inks.length;
  const best = new Float32Array(total);
  const pick = new Int16Array(total).fill(BG);
  for (let s = 0; s < total; s++) {
    let bv = 0;
    let bi = -1;
    for (let i = 0; i < k; i++)
      if (cov[i][s] > bv) {
        bv = cov[i][s];
        bi = i;
      }
    best[s] = bv;
    pick[s] = bi;
  }
  // Ink density around each stitch.
  const density = new Float32Array(total);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) {
            sum += Math.min(1, best[rr * cols + cc]);
            n++;
          }
        }
      density[r * cols + c] = sum / n;
    }

  // Tone colors only for the primary ink and only if the palette has room.
  const room = maxColors - 1 - k; // slots left after bg and inks
  const toneCount = k > 0 ? Math.max(0, Math.min(2, room)) : 0;

  // result: -1 background, 0..k-1 ink, k + t tone t (of the primary ink)
  const out = new Int16Array(total).fill(BG);
  const at = (i: number, r: number, c: number) => (r < 0 || c < 0 || r >= rows || c >= cols ? 0 : cov[i][r * cols + c]);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const s = r * cols + c;
      const i = pick[s];
      if (i < 0) continue;
      const v = best[s];
      const dense = density[s] >= SIMPLIFY.denseArea;
      if (v >= SIMPLIFY.solid) {
        out[s] = i;
        continue;
      }
      if (dense && toneCount > 0 && i === 0) {
        if (v >= SIMPLIFY.toneMin || density[s] >= SIMPLIFY.denseArea * 1.3) {
          out[s] = k + (toneCount > 1 && density[s] >= SIMPLIFY.mediumArea ? 1 : 0);
        }
        continue;
      }
      if (v < SIMPLIFY.ridge) continue;
      if (
        at(i, r - 1, c) >= SIMPLIFY.solid ||
        at(i, r + 1, c) >= SIMPLIFY.solid ||
        at(i, r, c - 1) >= SIMPLIFY.solid ||
        at(i, r, c + 1) >= SIMPLIFY.solid
      )
        continue;
      const horiz = v >= at(i, r, c - 1) && v > at(i, r, c + 1);
      const vert = v >= at(i, r - 1, c) && v > at(i, r + 1, c);
      if (horiz || vert) out[s] = i;
    }

  // Palette: background, inks, tones.
  const colors: Array<{ l: number; a: number; b: number }> = [bg, ...inks];
  for (let t = 0; t < toneCount; t++) {
    const share = SIMPLIFY.tones[t];
    colors.push({
      l: bg.l + share * (inks[0].l - bg.l),
      a: bg.a + share * (inks[0].a - bg.a),
      b: bg.b + share * (inks[0].b - bg.b),
    });
  }
  const colorOf = (v: number) => v + 1; // -1 -> 0 (bg), 0..k-1 -> 1..k, k+t -> k+1+t
  const counts = new Array<number>(colors.length).fill(0);
  for (let s = 0; s < total; s++) counts[colorOf(out[s])]++;
  const order = colors.map((_, i) => i).filter((i) => counts[i] > 0 || i === 0);
  order.sort((x, y) => counts[y] - counts[x] || x - y);
  const remap = new Map<number, number>();
  const palette: PaletteColor[] = order.map((old, n) => {
    remap.set(old, n);
    const [r, g, b] = labToRgb(colors[old].l, colors[old].a, colors[old].b);
    return { r, g, b, hex: toHex(r, g, b) };
  });
  const cells: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = new Array<number>(cols);
    for (let c = 0; c < cols; c++) row[c] = remap.get(colorOf(out[r * cols + c])) as number;
    cells.push(row);
  }
  return { cols, rows, palette, cells };
}
