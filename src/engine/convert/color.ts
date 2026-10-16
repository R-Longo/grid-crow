// sRGB <-> CIE Lab (D65). Lab distances roughly match how different two colors look,
// which is what palette matching needs.

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAP = 24389 / 27;

const f = (t: number) => (t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116);
const finv = (t: number) => {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAP;
};

/** r, g, b in 0–255 (may be fractional). Writes L, a, b into out[o..o+2]. */
export function rgbToLab(r: number, g: number, b: number, out: Float32Array, o: number): void {
  const lin = (v: number) => {
    const i = Math.min(255, Math.max(0, v));
    const lo = Math.floor(i);
    const hi = Math.min(255, lo + 1);
    return LIN[lo] + (LIN[hi] - LIN[lo]) * (i - lo);
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = (0.2126729 * R + 0.7151522 * G + 0.072175 * B) / YN;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  out[o] = 116 * fy - 16;
  out[o + 1] = 500 * (fx - fy);
  out[o + 2] = 200 * (fy - fz);
}

/** Lab -> sRGB bytes (clamped to the displayable range). */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = finv(fx) * XN;
  const y = finv(fy) * YN;
  const z = finv(fz) * ZN;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const gam = (c: number) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
    return Math.min(255, Math.max(0, Math.round(v * 255)));
  };
  return [gam(R), gam(G), gam(B)];
}

export const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/** Straight-line distance between two Lab colors. */
export function deltaE(
  a: ArrayLike<number>,
  ao: number,
  b: ArrayLike<number>,
  bo: number,
): number {
  const dl = a[ao] - b[bo];
  const da = a[ao + 1] - b[bo + 1];
  const db = a[ao + 2] - b[bo + 2];
  return Math.sqrt(dl * dl + da * da + db * db);
}
