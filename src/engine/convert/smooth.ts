/**
 * Edge-preserving smoothing (bilateral filter) on Lab pixels.
 * Each pixel is replaced by an average of nearby pixels that look similar to it, so noise,
 * skin texture and fabric grain flatten out while real edges (an eye, an outline) stay sharp.
 */
export function bilateral(
  lab: Float32Array,
  width: number,
  height: number,
  radius = 3,
  sigmaSpatial = 2,
  sigmaRange = 12,
): Float32Array {
  const out = new Float32Array(lab.length);
  const size = 2 * radius + 1;
  const spatial = new Float32Array(size * size);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatial[(dy + radius) * size + dx + radius] = Math.exp(-(dx * dx + dy * dy) / (2 * sigmaSpatial * sigmaSpatial));
    }
  }
  // Range weights from a lookup table keyed by squared Lab distance.
  const TABLE = 2048;
  const MAXD2 = 12 * sigmaRange * sigmaRange;
  const range = new Float32Array(TABLE);
  for (let i = 0; i < TABLE; i++) range[i] = Math.exp(-((i / (TABLE - 1)) * MAXD2) / (2 * sigmaRange * sigmaRange));
  const rangeScale = (TABLE - 1) / MAXD2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 3;
      const L0 = lab[p];
      const A0 = lab[p + 1];
      const B0 = lab[p + 2];
      let sw = 0;
      let sl = 0;
      let sa = 0;
      let sb = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = (yy * width + xx) * 3;
          const dl = lab[q] - L0;
          const da = lab[q + 1] - A0;
          const db = lab[q + 2] - B0;
          const d2 = dl * dl + da * da + db * db;
          if (d2 >= MAXD2) continue;
          const w = spatial[(dy + radius) * size + dx + radius] * range[(d2 * rangeScale) | 0];
          sw += w;
          sl += lab[q] * w;
          sa += lab[q + 1] * w;
          sb += lab[q + 2] * w;
        }
      }
      out[p] = sl / sw;
      out[p + 1] = sa / sw;
      out[p + 2] = sb / sw;
    }
  }
  return out;
}
