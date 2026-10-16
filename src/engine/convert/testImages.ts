import type { Raster } from "./types";

export type RGB = [number, number, number];

export const WHITE: RGB = [255, 255, 255];
export const RED: RGB = [210, 35, 35];
export const BLUE: RGB = [35, 65, 205];
export const GREEN: RGB = [35, 150, 65];
export const BLACK: RGB = [20, 20, 20];
export const GOLD: RGB = [240, 200, 0];

/** What color a point (u, v in 0–1) has in the geometric test picture. */
export function shapeColorAt(u: number, v: number): RGB {
  if (u >= 0.1 && u <= 0.45 && v >= 0.08 && v <= 0.3) return RED; // rectangle
  if ((u - 0.72) ** 2 + ((v - 0.2) * (4 / 3)) ** 2 <= 0.17 ** 2) return BLUE; // circle
  if (v >= 0.45 && v <= 0.75 && u >= 0.08 && u <= 0.08 + 0.4 * ((v - 0.45) / 0.3)) return GREEN; // triangle
  if (v >= 0.84 && v <= 0.92) return BLACK; // bar
  return WHITE;
}

/** Flat-colored shapes on white: red rectangle, blue circle, green triangle, black bar. */
export function geometricShapes(width = 300, height = 400): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = shapeColorAt((x + 0.5) / width, (y + 0.5) / height);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

/** A smooth multi-color gradient with texture: a stress picture that is not made of flat colors. */
export function gradientPicture(width: number, height: number): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const noise = ((x * 7 + y * 13) % 11) - 5;
      data[p] = (x / width) * 255 + noise;
      data[p + 1] = (y / height) * 255 + noise;
      data[p + 2] = 255 - (x / width) * 160 + noise;
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Fill a rectangle (fractions of the picture) with a color. */
export function paintRect(img: Raster, u0: number, v0: number, u1: number, v1: number, c: RGB, alpha = 255): void {
  for (let y = Math.floor(v0 * img.height); y < Math.ceil(v1 * img.height); y++) {
    for (let x = Math.floor(u0 * img.width); x < Math.ceil(u1 * img.width); x++) {
      const p = (y * img.width + x) * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = alpha;
    }
  }
}

export function solid(width: number, height: number, c: RGB, alpha = 255): Raster {
  const img: Raster = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  paintRect(img, 0, 0, 1, 1, c, alpha);
  return img;
}

export const STEEL_BLUE: RGB = [80, 122, 148];

function disc(img: Raster, cx: number, cy: number, r: number, c: RGB): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const p = (y * img.width + x) * 4;
      img.data[p] = c[0];
      img.data[p + 1] = c[1];
      img.data[p + 2] = c[2];
      img.data[p + 3] = 255;
    }
  }
}

/** One 3 × 3 box blur, so edges are soft like a photograph's. */
function blur3(img: Raster): void {
  const { width: w, height: h } = img;
  const src = new Uint8ClampedArray(img.data);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += src[((y + dy) * w + x + dx) * 4 + ch];
        img.data[(y * w + x) * 4 + ch] = sum / 9;
      }
    }
  }
}

/** Where the two eyes are, as fractions of the picture (left, right). */
export const EYES: Array<[number, number]> = [
  [0.38, 0.375],
  [0.62, 0.375],
];

/**
 * A neutral gray-and-white "kitten": light gray background, warm gray head with shaded stripes,
 * white muzzle, and two small steel-blue eyes with dark pupils and a white highlight.
 * Each blue iris is only about 0.3% of the picture, like a real kitten photograph.
 */
export function neutralSubjectWithBlueEyes(width = 600, height = 800, irisRadiusFrac = 0.025): Raster {
  const img = solid(width, height, [205, 208, 212]);
  const w = width;
  const h = height;
  // Soft vertical gradient on the background and a shaded head, like a real photograph,
  // so many shades of gray compete for palette slots.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const g = 170 + 60 * (y / h);
      img.data[p] = g;
      img.data[p + 1] = g + 3;
      img.data[p + 2] = g + 7;
    }
  }
  const shade = (cx: number, cy: number, rx: number, ry: number, dark: RGB, light: RGB) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d > 1) continue;
        const t = Math.min(1, d);
        const p = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[p + ch] = light[ch] + (dark[ch] - light[ch]) * t;
      }
    }
  };
  shade(0.5 * w, 0.45 * h, 0.3 * w, 0.28 * h, [92, 84, 80], [176, 166, 156]); // shaded head
  shade(0.5 * w, 0.58 * h, 0.14 * w, 0.1 * h, [205, 200, 194], [244, 241, 236]); // muzzle
  shade(0.5 * w, 0.82 * h, 0.22 * w, 0.14 * h, [150, 146, 142], [232, 229, 225]); // chest
  paintRect(img, 0.46, 0.2, 0.54, 0.3, [84, 76, 72]); // forehead stripe
  paintRect(img, 0.3, 0.2, 0.36, 0.26, [110, 100, 94]);
  paintRect(img, 0.64, 0.2, 0.7, 0.26, [120, 110, 104]);
  for (const [u, v] of EYES) {
    const R = irisRadiusFrac * w;
    disc(img, u * w, v * h, R * 1.5, [60, 54, 52]); // dark eyelid ring
    // Muted steel-blue iris that darkens toward its rim, like a photographed eye.
    for (let r = R; r > 0.5; r -= 0.5) {
      const t = r / R;
      disc(img, u * w, v * h, r, [88 - 38 * t, 128 - 46 * t, 152 - 46 * t]);
    }
    disc(img, u * w, v * h, R * 0.42, [22, 22, 24]); // pupil
    disc(img, u * w - R * 0.3, v * h - R * 0.3, R * 0.15, [250, 250, 250]); // highlight
  }
  blur3(img);
  // Fine deterministic grain (no randomness), as in a photograph.
  for (let i = 0; i < w * h; i++) {
    const n = (Math.imul(i ^ 0x85ebca6b, 2246822507) >>> 0) % 9 - 4;
    for (let ch = 0; ch < 3; ch++) img.data[i * 4 + ch] = Math.max(0, Math.min(255, img.data[i * 4 + ch] + n));
  }
  return img;
}

/** Deterministic scattered one-pixel blue specks (like compression noise) over a neutral picture. */
export function neutralWithBlueNoise(width = 600, height = 800): Raster {
  const img = neutralSubjectWithBlueEyes(width, height, 0);
  // hash-based, no Math.random
  for (let i = 0; i < width * height; i++) {
    const hsh = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0;
    if (hsh % 400 === 0) {
      img.data[i * 4] = 70;
      img.data[i * 4 + 1] = 110;
      img.data[i * 4 + 2] = 160;
    }
  }
  return img;
}

export const OLIVE: RGB = [120, 121, 45];
export const CREAM: RGB = [252, 252, 249];

type Pt = [number, number];
/** The thin features of the line-art test picture, as polylines in picture coordinates (u, v in 0–1). */
export const LINE_FEATURES: Record<string, Pt[]> = {
  leftBrow: [[0.36, 0.4], [0.39, 0.385], [0.43, 0.38], [0.47, 0.39]],
  rightBrow: [[0.53, 0.39], [0.57, 0.38], [0.61, 0.385], [0.64, 0.4]],
  mouth: [[0.45, 0.58], [0.55, 0.58]],
  sunbeam: [[0.58, 0.3], [0.68, 0.22], [0.8, 0.12]],
  borderOuter: [[0.04, 0.02], [0.04, 0.98]],
  borderInner: [[0.075, 0.02], [0.075, 0.98]],
};

function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/**
 * Minimalist line art: olive lines about 0.3 of a stitch wide (at 24 × 32 in) on cream, antialiased.
 * Mirrors a celestial-sun card: closed-eye brows, mouth, one sunbeam and a double border.
 * The lines are thinner than one stitch, so only their position and connection can be carried over.
 */
export function oliveLineArt(width = 600, height = 800, lineWidthPx = 1.8): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  const polys = Object.values(LINE_FEATURES);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let d = Infinity;
      for (const poly of polys) {
        for (let i = 0; i + 1 < poly.length; i++) {
          d = Math.min(d, distToSegment(x + 0.5, y + 0.5, [poly[i][0] * width, poly[i][1] * height], [poly[i + 1][0] * width, poly[i + 1][1] * height]));
        }
      }
      const a = Math.max(0, Math.min(1, 0.5 + lineWidthPx / 2 - d));
      const p = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[p + c] = Math.round(CREAM[c] * (1 - a) + OLIVE[c] * a);
      data[p + 3] = 255;
    }
  }
  return { width, height, data };
}
