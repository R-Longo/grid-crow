import { ConversionError } from "./types";
import type { CropRect, Raster } from "./types";

/**
 * Transparent pixels become opaque by compositing over white, the same way for every
 * image, so the same picture always converts the same way. Opaque pixels are unchanged.
 */
export function flattenOnWhite(src: Raster): Raster {
  const out = new Uint8ClampedArray(src.data.length);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) {
      out[i] = d[i];
      out[i + 1] = d[i + 1];
      out[i + 2] = d[i + 2];
    } else {
      const inv = 255 - a;
      out[i] = (d[i] * a + 255 * inv + 127) / 255;
      out[i + 1] = (d[i + 1] * a + 255 * inv + 127) / 255;
      out[i + 2] = (d[i + 2] * a + 255 * inv + 127) / 255;
    }
    out[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data: out };
}

interface Span {
  start: number;
  weights: Float64Array;
}

/** For each output index, which source indices it covers and how much of each (area weights). */
function buildSpans(srcStart: number, srcLen: number, outLen: number, srcMax: number): Span[] {
  const scale = srcLen / outLen;
  const spans: Span[] = [];
  for (let o = 0; o < outLen; o++) {
    const a = srcStart + o * scale;
    const b = a + scale;
    const first = Math.max(0, Math.floor(a));
    const last = Math.min(srcMax - 1, Math.ceil(b) - 1);
    const weights = new Float64Array(Math.max(1, last - first + 1));
    let sum = 0;
    for (let s = first; s <= last; s++) {
      const w = Math.min(b, s + 1) - Math.max(a, s);
      weights[s - first] = w > 0 ? w : 0;
      sum += weights[s - first];
    }
    if (sum <= 0) weights[0] = 1;
    else for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    spans.push({ start: first, weights });
  }
  return spans;
}

/**
 * Cut `rect` out of an opaque picture and resize it to outW × outH by area averaging.
 * Averaging (not point sampling) keeps thin lines and small details from being skipped.
 * Returns interleaved RGB floats (3 per pixel).
 */
export function resampleArea(src: Raster, rect: CropRect, outW: number, outH: number): Float32Array {
  if (!(outW > 0 && outH > 0)) throw new ConversionError("invalid-grid", "The chart size is not valid.");
  const xs = buildSpans(rect.x, rect.w, outW, src.width);
  const ys = buildSpans(rect.y, rect.h, outH, src.height);
  const d = src.data;
  const out = new Float32Array(outW * outH * 3);

  // Pass 1: horizontal, only for the source rows that are needed.
  const rowMin = ys[0].start;
  const rowMax = ys[outH - 1].start + ys[outH - 1].weights.length - 1;
  const rows = rowMax - rowMin + 1;
  const tmp = new Float32Array(rows * outW * 3);
  for (let sy = rowMin; sy <= rowMax; sy++) {
    const base = sy * src.width * 4;
    const tbase = (sy - rowMin) * outW * 3;
    for (let ox = 0; ox < outW; ox++) {
      const { start, weights } = xs[ox];
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < weights.length; k++) {
        const p = base + (start + k) * 4;
        const w = weights[k];
        r += d[p] * w;
        g += d[p + 1] * w;
        b += d[p + 2] * w;
      }
      const t = tbase + ox * 3;
      tmp[t] = r;
      tmp[t + 1] = g;
      tmp[t + 2] = b;
    }
  }
  // Pass 2: vertical.
  for (let oy = 0; oy < outH; oy++) {
    const { start, weights } = ys[oy];
    for (let ox = 0; ox < outW; ox++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = 0; k < weights.length; k++) {
        const t = (start + k - rowMin) * outW * 3 + ox * 3;
        const w = weights[k];
        r += tmp[t] * w;
        g += tmp[t + 1] * w;
        b += tmp[t + 2] * w;
      }
      const o = (oy * outW + ox) * 3;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  return out;
}
