import { describe, expect, it } from "vitest";
import { ROWS_PER_INCH, STITCHES_PER_INCH } from "../../config/gauge";
import { FINISHED_SIZES } from "../../config/sizes";
import { buildGridSpec } from "../geometry";
import { MAX_ZOOM, canvasSize, clampZoom, fitZoom, pointToStitch, previewHeight } from "./coords";

const ASPECT = ROWS_PER_INCH / STITCHES_PER_INCH;
/** Preview widths x window heights: phones (portrait and sideways), small phone, tablets, laptops, wide desktop. */
const SCREENS = [
  [318, 568], [388, 844], [842, 390], [766, 1024], [1022, 768], [1100, 1000], [1278, 800], [1800, 1100], [600, 2000], [2400, 500],
] as const;

function chartPixels(cols: number, rows: number, viewW: number, zoom: number) {
  const cellH = (viewW / (cols * ASPECT)) * zoom;
  return canvasSize({ cols, rows, cellW: cellH * ASPECT, cellH });
}

describe("fitZoom: the whole chart is visible", () => {
  for (const size of FINISHED_SIZES) {
    for (const orientation of ["portrait", "landscape"] as const) {
      const spec = buildGridSpec({ sizeId: size.id, orientation, maxColors: 6 });
      it(`${size.id} ${orientation} (${spec.cols} x ${spec.rows}) fits every screen with all four edges showing, undistorted`, () => {
        for (const [viewW, winH] of SCREENS) {
          const viewH = previewHeight(winH);
          const fit = fitZoom(spec.cols, spec.rows, viewW, viewH, ASPECT);
          expect(fit).toBeGreaterThan(0);
          expect(fit).toBeLessThanOrEqual(1);
          const px = chartPixels(spec.cols, spec.rows, viewW, fit);
          // never wider or taller than the preview (a pixel of rounding is allowed for the canvas, none for the box)
          expect(px.w).toBeLessThanOrEqual(viewW);
          expect(px.h).toBeLessThanOrEqual(viewH);
          // and it uses the room: one direction is (nearly) full, unless the chart is wide and short (then width is full)
          const fullW = px.w >= viewW * 0.99;
          const fullH = px.h >= viewH * 0.99;
          expect(fullW || fullH).toBe(true);
          // shape is the crochet shape: each stitch is 4 per inch across x 4.5 rows per inch down
          const stitchW = px.w / spec.cols;
          const stitchH = px.h / spec.rows;
          expect(stitchW / stitchH).toBeCloseTo(ASPECT, 1);
        }
      });
    }
  }
  it("tall portrait charts are limited by height, wide landscape charts by width", () => {
    const tall = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 6 });
    const wide = buildGridSpec({ sizeId: "24x32", orientation: "landscape", maxColors: 6 });
    expect(fitZoom(tall.cols, tall.rows, 1100, 700, ASPECT)).toBeLessThan(0.6);
    expect(fitZoom(wide.cols, wide.rows, 1100, 1000, ASPECT)).toBe(1);
  });
  it("is bigger in a bigger preview, and never below the slider's useful range", () => {
    const s = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 6 });
    const small = fitZoom(s.cols, s.rows, 400, 500, ASPECT);
    const large = fitZoom(s.cols, s.rows, 400, 900, ASPECT);
    expect(large).toBeGreaterThan(small);
    expect(small).toBeLessThan(MAX_ZOOM);
  });
  it("ignores nonsense sizes (before the preview has been measured)", () => {
    expect(fitZoom(96, 144, 0, 700, ASPECT)).toBe(1);
    expect(fitZoom(96, 144, 400, 0, ASPECT)).toBe(1);
    expect(fitZoom(0, 0, 400, 400, ASPECT)).toBe(1);
  });
});

describe("zoom range", () => {
  it("never goes below the fit, and 8 is still the most you can zoom in", () => {
    expect(clampZoom(0.1, 0.4)).toBe(0.4);
    expect(clampZoom(3, 0.4)).toBe(3);
    expect(clampZoom(99, 0.4)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN, 0.4)).toBe(0.4);
  });
  it("at maximum zoom a stitch is large enough to edit on every screen", () => {
    for (const [viewW] of SCREENS) {
      const cellH = (viewW / (96 * ASPECT)) * MAX_ZOOM;
      expect(cellH * ASPECT).toBeGreaterThan(viewW > 600 ? 5 : 3); // px; the same as before this change
    }
  });
  it("stitch lookup still agrees with the drawing at the fitted size, for every stitch", () => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const spec = buildGridSpec({ sizeId: "24x32", orientation, maxColors: 6 });
      for (const [viewW, winH] of SCREENS) {
        const fit = fitZoom(spec.cols, spec.rows, viewW, previewHeight(winH), ASPECT);
        const cellH = (viewW / (spec.cols * ASPECT)) * fit;
        const layout = { cols: spec.cols, rows: spec.rows, cellW: cellH * ASPECT, cellH };
        const { w, h } = canvasSize(layout);
        // the first and last pixel of the chart are the first and last stitch
        expect(pointToStitch(0, 0, layout)).toEqual({ col: 0, row: 0 });
        expect(pointToStitch(w - 1, h - 1, layout)).toEqual({ col: spec.cols - 1, row: spec.rows - 1 });
        expect(pointToStitch(w, h - 1, layout)).toBeNull();
      }
    }
  });
});

describe("previewHeight", () => {
  it("uses the window less room for the controls, within sensible limits", () => {
    expect(previewHeight(1000)).toBe(720);
    expect(previewHeight(300)).toBe(260);
    expect(previewHeight(4000)).toBe(1100);
    // the compact (phone) layout also has a header and a dock to make room for
    expect(previewHeight(844, true)).toBe(514);
    expect(previewHeight(1000, true)).toBeLessThan(previewHeight(1000));
    expect(previewHeight(500, true)).toBe(260);
    expect(previewHeight(390, true, true)).toBe(240); // sideways phone: dock beside the chart
  });
});
