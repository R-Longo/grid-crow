import { deltaE } from "./color";

/**
 * Deterministic palette selection: weighted k-means in Lab on a histogram of the picture's colors.
 *
 *  1. Pixels are grouped into small Lab "bins" (≈3 units wide). Each bin has a mean color and a pixel count.
 *  2. Starting colors are chosen by farthest-point seeding: first the most common color, then
 *     repeatedly the bin that is far from every chosen color, weighted by sqrt(pixel count).
 *     The sqrt keeps small but strongly different features (a gold eye on a dark head) in
 *     the running instead of letting large areas drown them out.
 *  3. Lloyd iterations move each color to the weighted mean of the bins closest to it.
 *  4. Salient-color rescue (see rescueSalientColors): a small but clearly different color that
 *     the first pass left out may take the slot of a near-duplicate shade.
 *
 * No randomness is used anywhere: same pixels in, same palette out.
 */
export interface Bins {
  n: number;
  lab: Float64Array; // 3 per bin: mean L, a, b
  count: Float64Array;
}

export function buildBins(lab: Float32Array, step = 3): Bins {
  const map = new Map<number, number>();
  const sums: number[] = [];
  const counts: number[] = [];
  for (let i = 0; i < lab.length; i += 3) {
    const L = Math.floor(lab[i] / step);
    const A = Math.floor((lab[i + 1] + 160) / step);
    const B = Math.floor((lab[i + 2] + 160) / step);
    const key = (L * 256 + A) * 256 + B;
    let idx = map.get(key);
    if (idx === undefined) {
      idx = counts.length;
      map.set(key, idx);
      counts.push(0);
      sums.push(0, 0, 0);
    }
    counts[idx]++;
    sums[idx * 3] += lab[i];
    sums[idx * 3 + 1] += lab[i + 1];
    sums[idx * 3 + 2] += lab[i + 2];
  }
  const n = counts.length;
  const out = new Float64Array(n * 3);
  const count = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    count[i] = counts[i];
    out[i * 3] = sums[i * 3] / counts[i];
    out[i * 3 + 1] = sums[i * 3 + 1] / counts[i];
    out[i * 3 + 2] = sums[i * 3 + 2] / counts[i];
  }
  return { n, lab: out, count };
}

function nearest(bins: Bins, i: number, cents: Float64Array, k: number): [number, number] {
  let best = 0;
  let bd = Infinity;
  for (let c = 0; c < k; c++) {
    const d = deltaE(bins.lab, i * 3, cents, c * 3);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return [best, bd];
}

function seed(bins: Bins, k: number): Float64Array {
  const cents = new Float64Array(k * 3);
  let first = 0;
  for (let i = 1; i < bins.n; i++) if (bins.count[i] > bins.count[first]) first = i;
  cents.set(bins.lab.subarray(first * 3, first * 3 + 3), 0);
  const minD = new Float64Array(bins.n);
  for (let i = 0; i < bins.n; i++) minD[i] = deltaE(bins.lab, i * 3, cents, 0);
  for (let c = 1; c < k; c++) {
    let pick = -1;
    let best = 0;
    for (let i = 0; i < bins.n; i++) {
      const s = Math.sqrt(bins.count[i]) * minD[i] * minD[i];
      if (s > best) {
        best = s;
        pick = i;
      }
    }
    if (pick < 0) break; // fewer distinct colors than k
    cents.set(bins.lab.subarray(pick * 3, pick * 3 + 3), c * 3);
    for (let i = 0; i < bins.n; i++) {
      const d = deltaE(bins.lab, i * 3, cents, c * 3);
      if (d < minD[i]) minD[i] = d;
    }
  }
  return cents;
}

function lloyd(bins: Bins, cents: Float64Array, k: number, maxIter = 24): Float64Array {
  const assign = new Int32Array(bins.n).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    const sum = new Float64Array(k * 3);
    const w = new Float64Array(k);
    for (let i = 0; i < bins.n; i++) {
      const [c] = nearest(bins, i, cents, k);
      if (assign[i] !== c) {
        assign[i] = c;
        changed = true;
      }
      w[c] += bins.count[i];
      sum[c * 3] += bins.lab[i * 3] * bins.count[i];
      sum[c * 3 + 1] += bins.lab[i * 3 + 1] * bins.count[i];
      sum[c * 3 + 2] += bins.lab[i * 3 + 2] * bins.count[i];
    }
    for (let c = 0; c < k; c++) {
      if (w[c] > 0) {
        cents[c * 3] = sum[c * 3] / w[c];
        cents[c * 3 + 1] = sum[c * 3 + 1] / w[c];
        cents[c * 3 + 2] = sum[c * 3 + 2] / w[c];
      }
    }
    if (!changed) break;
  }
  return cents;
}

/** Optional pixel context, used to confirm that a rescued color forms a real shape and not scattered noise. */
export interface PixelContext {
  lab: Float32Array;
  width: number;
  height: number;
}

/** Tunables for the salient-color rescue. Exported so tests and docs can refer to them. */
export const RESCUE = {
  /** A color is "left out" when its nearest palette color is at least this far away overall (Lab)… */
  outlierDE: 16,
  /** …AND differs in actual hue/chroma (the a and b axes of Lab) by at least this much. Brightness-only
   *  differences (one more shade of gray) don't count: those are what the main palette already covers. */
  outlierChroma: 14,
  /** Outlier bins closer than this (lightness counted at half weight) are treated as one color. */
  clusterDE: 18,
  /** The color must cover at least this fraction of the picture (≈ 1–2 stitches' worth)… */
  minMassFraction: 0.0003,
  /** …and form one connected patch of at least this many pixels (rejects scattered noise). */
  minBlobPixels: 18,
  /** Pixels within this distance of the color count toward its patch. */
  blobDE: 22,
  /** A palette slot may be given up only if its nearest other palette color is this close (a near-duplicate shade). */
  nearDuplicateDE: 28,
  /** How much more a distinct color's benefit counts than its raw area (small features matter more than their size). */
  salience: 14,
  /** Most colors that can be rescued: 1 for small palettes, 2 for 8 or more. */
  maxRescues: (k: number) => (k >= 8 ? 2 : k >= 4 ? 1 : 0),
};

/** Lab distance with lightness at half weight: a dark and a light shade of one hue stay one color. */
function hueDist(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number): number {
  const dl = (a[ao] - b[bo]) * 0.5;
  const da = a[ao + 1] - b[bo + 1];
  const db = a[ao + 2] - b[bo + 2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

/** Difference in hue/chroma only (a*, b*). */
function chromaDiff(a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number): number {
  return Math.hypot(a[ao + 1] - b[bo + 1], a[ao + 2] - b[bo + 2]);
}

function largestBlob(px: PixelContext, center: Float64Array): number {
  const { lab, width, height } = px;
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  let best = 0;
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    seen[start] = 1;
    if (hueDist(lab, start * 3, center, 0) >= RESCUE.blobDE) continue;
    let size = 0;
    stack.push(start);
    while (stack.length) {
      const cur = stack.pop() as number;
      size++;
      const x = cur % width;
      const y = (cur - x) / width;
      const nbs = [x > 0 ? cur - 1 : -1, x < width - 1 ? cur + 1 : -1, y > 0 ? cur - width : -1, y < height - 1 ? cur + width : -1];
      for (const q of nbs) {
        if (q < 0 || seen[q]) continue;
        seen[q] = 1;
        if (hueDist(lab, q * 3, center, 0) < RESCUE.blobDE) stack.push(q);
      }
    }
    if (size > best) best = size;
  }
  return best;
}

interface Cluster {
  mass: number;
  lab: Float64Array;
  dist: number; // mass-weighted distance to the current palette
  wsum: number;
}

/** Group the colors the palette serves poorly into distinct color clusters (deterministic, greedy). */
function outlierClusters(bins: Bins, cents: Float64Array, k: number): Cluster[] {
  const order: number[] = [];
  const dist = new Float64Array(bins.n);
  for (let i = 0; i < bins.n; i++) {
    const [c, d] = nearest(bins, i, cents, k);
    dist[i] = d;
    if (d >= RESCUE.outlierDE && chromaDiff(bins.lab, i * 3, cents, c * 3) >= RESCUE.outlierChroma) order.push(i);
  }
  order.sort((a, b) => bins.count[b] - bins.count[a] || a - b);
  const clusters: Cluster[] = [];
  for (const i of order) {
    let target: Cluster | null = null;
    let td = RESCUE.clusterDE;
    for (const c of clusters) {
      const d = hueDist(bins.lab, i * 3, c.lab, 0);
      if (d < td) {
        td = d;
        target = c;
      }
    }
    if (!target) {
      target = { mass: 0, lab: new Float64Array(3), dist: 0, wsum: 0 };
      target.lab.set(bins.lab.subarray(i * 3, i * 3 + 3));
      clusters.push(target);
    }
    const m = bins.count[i];
    // The cluster's color leans toward its purest (most saturated) members, because area
    // averaging and smoothing only ever make a small feature's color duller, never more vivid.
    const chroma = Math.hypot(bins.lab[i * 3 + 1], bins.lab[i * 3 + 2]);
    const wgt = m * (1 + (chroma / 20) ** 2);
    const t = wgt / (target.wsum + wgt);
    for (let j = 0; j < 3; j++) target.lab[j] += (bins.lab[i * 3 + j] - target.lab[j]) * t;
    target.wsum += wgt;
    target.dist = (target.dist * target.mass + dist[i] * m) / (target.mass + m);
    target.mass += m;
  }
  return clusters;
}

/**
 * Salient-color rescue.
 *
 * Plain k-means gives palette slots to AREA. A pair of bright blue eyes on a gray kitten is about
 * 0.1% of the picture, and because blue shows up in many slightly different shades, no single
 * histogram bin is big enough to look important, so the grays get every slot.
 *
 * Here, the colors the palette serves badly are grouped into whole color clusters, and the best one
 * is added if (a) it is big enough to be seen at chart scale, (b) it forms one real connected
 * patch rather than scattered noise, and (c) a slot can be freed by merging a near-duplicate shade
 * (two grays a few steps apart) without a visible loss. Colors are taken from the picture itself,
 * never invented, and the total never exceeds the requested maximum.
 */
function rescueSalientColors(bins: Bins, cents: Float64Array, k: number, px?: PixelContext): Float64Array {
  if (k < 2 || !px) return cents;
  const total = px.width * px.height;
  let cur = cents;
  const rescued = new Set<number>(); // slots already given to a rescued color are never given up again
  for (let round = 0; round < RESCUE.maxRescues(k); round++) {
    const clusters = outlierClusters(bins, cur, k)
      .filter((c) => c.mass >= RESCUE.minMassFraction * total)
      .sort((a, b) => Math.sqrt(b.mass) * b.dist * b.dist - Math.sqrt(a.mass) * a.dist * a.dist);
    const pick = clusters.find((c) => largestBlob(px, c.lab) >= RESCUE.minBlobPixels);
    if (!pick) break;

    // Find the cheapest palette slot to give up: weight of pixels × (distance to its nearest neighbour)².
    const weight = new Float64Array(k);
    for (let i = 0; i < bins.n; i++) weight[nearest(bins, i, cur, k)[0]] += bins.count[i];
    let slot = -1;
    let slotCost = Infinity;
    for (let c = 0; c < k; c++) {
      if (rescued.has(c)) continue;
      let dn = Infinity;
      for (let o = 0; o < k; o++) if (o !== c) dn = Math.min(dn, deltaE(cur, c * 3, cur, o * 3));
      if (dn > RESCUE.nearDuplicateDE) continue;
      const cost = weight[c] * dn * dn;
      if (cost < slotCost) {
        slotCost = cost;
        slot = c;
      }
    }
    if (slot < 0) break;
    const gain = pick.mass * pick.dist * pick.dist * RESCUE.salience;
    if (gain < slotCost) break;

    const next = new Float64Array(cur);
    next.set(pick.lab, slot * 3);
    rescued.add(slot);
    cur = lloyd(bins, next, k, 12);
  }
  return cur;
}

/** Returns at most k Lab colors (fewer if the picture has fewer distinct colors). */
export function choosePalette(bins: Bins, k: number, px?: PixelContext): Float64Array {
  const kk = Math.min(k, bins.n);
  const base = lloyd(bins, seed(bins, kk), kk);
  return rescueSalientColors(bins, base, kk, px);
}
