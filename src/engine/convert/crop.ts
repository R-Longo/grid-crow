import type { CropRect, CropState } from "./types";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const DEFAULT_CROP: CropState = { zoom: 1, cx: 0.5, cy: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Physical aspect ratio (width ÷ height) of the finished tapestry, from its size in inches.
 * IMPORTANT: this is NOT cols ÷ rows. Stitches are wider than rows are tall, so a 12 × 16 in
 * tapestry (48 × 72 stitches) must be cropped 3:4, not 2:3.
 */
export function physicalAspect(widthInches: number, heightInches: number): number {
  return widthInches / heightInches;
}

/**
 * The region of the picture to keep, in source pixels. It always has exactly the requested
 * aspect ratio and always lies inside the picture, so the picture is never stretched.
 */
export function cropRect(imgW: number, imgH: number, aspect: number, crop: CropState): CropRect {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  // Largest rectangle with this aspect that fits inside the picture.
  let baseW: number;
  let baseH: number;
  if (imgW / imgH > aspect) {
    baseH = imgH;
    baseW = baseH * aspect;
  } else {
    baseW = imgW;
    baseH = baseW / aspect;
  }
  const w = baseW / zoom;
  const h = baseH / zoom;
  const x = clamp(crop.cx * imgW - w / 2, 0, imgW - w);
  const y = clamp(crop.cy * imgH - h / 2, 0, imgH - h);
  return { x, y, w, h };
}

/** Move the crop by a distance in source pixels (used when dragging). */
export function moveCrop(
  imgW: number,
  imgH: number,
  aspect: number,
  crop: CropState,
  dxSource: number,
  dySource: number,
): CropState {
  const r = cropRect(imgW, imgH, aspect, crop);
  return {
    zoom: clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM),
    cx: (r.x + dxSource + r.w / 2) / imgW,
    cy: (r.y + dySource + r.h / 2) / imgH,
  };
}

/** Normalise a crop so its centre is one that keeps the region inside the picture. */
export function settleCrop(imgW: number, imgH: number, aspect: number, crop: CropState): CropState {
  const r = cropRect(imgW, imgH, aspect, crop);
  return {
    zoom: clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM),
    cx: (r.x + r.w / 2) / imgW,
    cy: (r.y + r.h / 2) / imgH,
  };
}
