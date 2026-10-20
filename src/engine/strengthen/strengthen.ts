import type { Raster } from "../convert/types";

/**
 * "Strengthen thin lines": a step that can run BEFORE the converter on pictures made of thin dark lines.
 * A chart cannot draw anything narrower than one stitch, so a pen line that is a fraction of a stitch wide gets averaged away
 * into the paper color. This finds the dark strokes that are thinner than about one stitch, widens them to roughly one
 * stitch, darkens them to the darkest color along the stroke, and drops specks much smaller than a stitch.
 *
 * Pure: no DOM, no randomness. Works on a working-size copy (about WORK_PX_PER_STITCH pixels per stitch) so it is fast.
 * The result is an ordinary Raster for the unchanged converter, with the same proportions as the input.
 * Nothing here is wired into the app yet.
 */

export const WORK_PX_PER_STITCH = 8;
const MAX_ENLARGE = 4;
/** A pixel is part of a thin dark stroke when it is this much darker than its surroundings (0..255 luminance). */
export const STROKE_CONTRAST = 45;

export interface StrengthenOptions {
  /** Stitches across the part of the picture that becomes the chart. */
  cols: number;
  /** Width / height of that part of the picture (the physical aspect of the finished piece). */
  aspect: number;
}

export interface StrengthenStats {
  /** Share of the picture that is thin dark stroke before widening (0..1). */
  strokeShare: number;
  /** Share covered after widening. */
  widenedShare: number;
  /** Number of separate strokes kept. */
  strokes: number;
  /** Source pixels per stitch at the working size. */
  pxPerStitch: number;
}

export interface StrengthenResult {
  raster: Raster;
  stats: StrengthenStats;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Area-average resize to w x h (RGBA, premultiplied by nothing: the picture is flattened on white first). */
export function resizeAverage(src: Raster, w: number, h: number): Raster {
  if (w === src.width && h === src.height) return { width: w, height: h, data: new Uint8ClampedArray(flatten(src)) };
  const flat = flatten(src);
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = (y + 1) * sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = (x + 1) * sx;
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.min(src.height, Math.ceil(y1)); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.min(src.width, Math.ceil(x1)); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          const wt = wx * wy;
          const i = (yy * src.width + xx) * 4;
          r += flat[i] * wt; g += flat[i + 1] * wt; b += flat[i + 2] * wt; wsum += wt;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / wsum; out[o + 1] = g / wsum; out[o + 2] = b / wsum; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** The picture on white, so transparent pixels do not read as black. */
function flatten(src: Raster): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.data.length);
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    out[i] = src.data[i] * a + 255 * (1 - a);
    out[i + 1] = src.data[i + 1] * a + 255 * (1 - a);
    out[i + 2] = src.data[i + 2] * a + 255 * (1 - a);
    out[i + 3] = 255;
  }
  return out;
}

/** Offsets (dx) of the half-width of a disc of radius r, for each dy in -k..k. */
function discRuns(r: number): Array<{ dy: number; half: number }> {
  const k = Math.ceil(r);
  const runs: Array<{ dy: number; half: number }> = [];
  for (let dy = -k; dy <= k; dy++) {
    const rem = r * r + 1e-9 - dy * dy;
    if (rem < 0) continue;
    runs.push({ dy, half: Math.floor(Math.sqrt(rem)) });
  }
  return runs;
}

/** 1-D sliding max (mode +1) or min (mode -1) of width 2*half+1 along a row, edges clamped. */
function slide(src: Float32Array, dst: Float32Array, w: number, half: number, mode: 1 | -1) {
  const deque: number[] = [];
  let head = 0;
  const better = (a: number, b: number) => (mode === 1 ? a >= b : a <= b);
  let next = 0;
  for (let x = 0; x < w; x++) {
    const hi = Math.min(w - 1, x + half);
    while (next <= hi) {
      while (deque.length > head && better(src[next], src[deque[deque.length - 1]])) deque.pop();
      deque.push(next++);
    }
    while (deque[head] < x - half) head++;
    dst[x] = src[deque[head]];
  }
}

/** Dilate (mode 1) or erode (mode -1) a luminance image with a disc. */
function morph(L: Float32Array, w: number, h: number, r: number, mode: 1 | -1): Float32Array {
  const runs = discRuns(r);
  const halves = [...new Set(runs.map((q) => q.half))];
  const rowFiltered = new Map<number, Float32Array>();
  for (const half of halves) {
    const f = new Float32Array(w * h);
    const tmp = new Float32Array(w);
    const row = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) row[x] = L[y * w + x];
      slide(row, tmp, w, half, mode);
      f.set(tmp, y * w);
    }
    rowFiltered.set(half, f);
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = mode === 1 ? -Infinity : Infinity;
      for (const { dy, half } of runs) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        const t = rowFiltered.get(half)![yy * w + x];
        if (mode === 1 ? t > v : t < v) v = t;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** 8-connected components of a mask. Returns labels (0 = none) and the count. */
function components(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  let count = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue;
    count++;
    labels[s] = count;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = count;
            stack.push(q);
          }
        }
      }
    }
  }
  return { labels, count };
}

/**
 * Widen the thin dark strokes of `src`. Returns a working-size raster for the converter and a few numbers about the picture
 * (used to decide whether the picture is the kind this helps).
 */
export function strengthenThinLines(src: Raster, opts: StrengthenOptions): StrengthenResult {
  // Working size: about WORK_PX_PER_STITCH pixels per stitch across the chart part of the picture (enlarged at most 4x).
  const cropW = Math.min(src.width, src.height * opts.aspect);
  const srcPerStitch = cropW / opts.cols;
  // Small pictures are enlarged (up to 4x) so a widening of a fraction of a source pixel can still be drawn.
  const scale = Math.min(MAX_ENLARGE, WORK_PX_PER_STITCH / srcPerStitch);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const work = resizeAverage(src, w, h);
  const stitch = (cropW * scale) / opts.cols;

  const N = w * h;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = lum(work.data[i * 4], work.data[i * 4 + 1], work.data[i * 4 + 2]);

  // Thin dark features: black top-hat, i.e. (closing - original) with a disc about one stitch wide.
  const se = Math.max(1, stitch * 0.5);
  const closed = morph(morph(L, w, h, se, 1), w, h, se, -1);
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) ink[i] = closed[i] - L[i] > STROKE_CONTRAST ? 1 : 0;

  // Drop specks far smaller than a stitch.
  const first = components(ink, w, h);
  const minExtent = Math.max(2, stitch * 1.2);
  const ext = Array.from({ length: first.count + 1 }, () => ({ x0: w, x1: -1, y0: h, y1: -1 }));
  for (let i = 0; i < N; i++) {
    const l = first.labels[i];
    if (!l) continue;
    const x = i % w;
    const y = (i - x) / w;
    const e = ext[l];
    if (x < e.x0) e.x0 = x;
    if (x > e.x1) e.x1 = x;
    if (y < e.y0) e.y0 = y;
    if (y > e.y1) e.y1 = y;
  }
  for (let i = 0; i < N; i++) {
    const l = first.labels[i];
    if (!l) continue;
    const e = ext[l];
    if (Math.max(e.x1 - e.x0 + 1, e.y1 - e.y0 + 1) < minExtent) ink[i] = 0;
  }

  const { labels, count } = components(ink, w, h);
  // Darkest color along each stroke.
  const darkest = new Float32Array((count + 1) * 3);
  const darkL = new Float32Array(count + 1).fill(Infinity);
  for (let i = 0; i < N; i++) {
    const l = labels[i];
    if (l && L[i] < darkL[l]) {
      darkL[l] = L[i];
      darkest[l * 3] = work.data[i * 4];
      darkest[l * 3 + 1] = work.data[i * 4 + 1];
      darkest[l * 3 + 2] = work.data[i * 4 + 2];
    }
  }

  // Growth: a pixel joins the nearest stroke if it is within r of it AND within half the local gap, so two close
  // strokes never fuse into a blob. Distances are searched only up to the cap, which is all the rule can use.
  const r = stitch * 0.42;
  const cap = Math.ceil(r * 2) + 1;
  const offs: Array<{ dx: number; dy: number; d: number }> = [];
  for (let dy = -cap; dy <= cap; dy++) for (let dx = -cap; dx <= cap; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= cap) offs.push({ dx, dy, d });
  }
  offs.sort((a, b) => a.d - b.d);
  const dist = new Float32Array(N).fill(cap);
  const nearest = new Int32Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (ink[p]) {
        dist[p] = 0;
        nearest[p] = labels[p];
        continue;
      }
      for (const o of offs) {
        const nx = x + o.dx;
        const ny = y + o.dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (ink[q]) {
          dist[p] = o.d;
          nearest[p] = labels[q];
          break;
        }
      }
    }
  }
  const k = Math.ceil(r);
  const out = new Uint8ClampedArray(work.data);
  let grownCount = 0;
  let inkCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let l = 0;
      if (ink[p]) {
        l = labels[p];
        inkCount++;
      } else if (dist[p] <= r) {
        let room = 0;
        for (let dy = -k; dy <= k; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -k; dx <= k; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const v = dist[yy * w + xx];
            if (v > room) room = v;
          }
        }
        if (dist[p] <= Math.max(1, room * 0.5)) {
          l = nearest[p];
          grownCount++;
        }
      }
      if (l) {
        out[p * 4] = darkest[l * 3];
        out[p * 4 + 1] = darkest[l * 3 + 1];
        out[p * 4 + 2] = darkest[l * 3 + 2];
      }
    }
  }
  return {
    raster: { width: w, height: h, data: out },
    stats: { strokeShare: inkCount / N, widenedShare: (inkCount + grownCount) / N, strokes: count, pxPerStitch: stitch },
  };
}

export interface Suitability {
  /** Share of the picture that is "paper": close to the most common color (0..1). */
  paperShare: number;
  /** Luminance (0..255) of that most common color. */
  paperLuminance: number;
  /** True for a line drawing on light paper: mostly one light background with dark strokes on it. */
  lineArt: boolean;
}

/** Quick look at a picture (on a small copy) to tell line art on light paper from paintings, photos and dark-background art. */
export const LINE_ART_MIN_PAPER_SHARE = 0.7;
export const LINE_ART_MIN_PAPER_LUMINANCE = 200;

export function assessPicture(src: Raster): Suitability {
  const long = Math.max(src.width, src.height);
  const k = Math.min(1, 200 / long);
  const small = resizeAverage(src, Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
  const n = small.width * small.height;
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < n; i++) {
    const r = small.data[i * 4], g = small.data[i * 4 + 1], b = small.data[i * 4 + 2];
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    e.count++; e.r += r; e.g += g; e.b += b;
    bins.set(key, e);
  }
  let best = { count: 0, r: 0, g: 0, b: 0 };
  for (const e of bins.values()) if (e.count > best.count) best = e;
  const mr = best.r / best.count, mg = best.g / best.count, mb = best.b / best.count;
  let near = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(small.data[i * 4] - mr) + Math.abs(small.data[i * 4 + 1] - mg) + Math.abs(small.data[i * 4 + 2] - mb);
    if (d < 60) near++;
  }
  const paperShare = near / n;
  const paperLuminance = lum(mr, mg, mb);
  return { paperShare, paperLuminance, lineArt: paperShare >= LINE_ART_MIN_PAPER_SHARE && paperLuminance >= LINE_ART_MIN_PAPER_LUMINANCE };
}
