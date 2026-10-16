import { describe, expect, it } from "vitest";
import { FINISHED_SIZES } from "../../config/sizes";
import { buildGridSpec } from "../geometry";
import type { GridSpec } from "../geometry";
import type { MaxColors, Orientation } from "../../types";
import { convertRaster } from "./convert";
import { DEFAULT_CROP } from "./crop";
import {
  BLACK, BLUE, GOLD, GREEN, RED, WHITE,
  geometricShapes, gradientPicture, paintRect, shapeColorAt, solid,
} from "./testImages";
import type { RGB } from "./testImages";
import { validateMatrix } from "./validate";
import { ConversionError } from "./types";
import type { Raster, StitchMatrix } from "./types";

const spec = (sizeId: GridSpec["sizeId"], orientation: Orientation, maxColors: MaxColors = 6) =>
  buildGridSpec({ sizeId, orientation, maxColors });

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rgbAt = (m: StitchMatrix, c: number, r: number): RGB => {
  const p = m.palette[m.cells[r][c]];
  return [p.r, p.g, p.b];
};

describe("1. matrix dimensions match the Stage 2 grid spec", () => {
  it.each(FINISHED_SIZES.flatMap((s) => (["portrait", "landscape"] as const).map((o) => [s.id, o] as const)))(
    "%s %s",
    (id, orientation) => {
      const s = spec(id, orientation);
      const m = convertRaster(geometricShapes(240, 320), DEFAULT_CROP, s);
      expect(m.cols).toBe(s.cols);
      expect(m.rows).toBe(s.rows);
      expect(m.cells.length).toBe(s.rows);
      expect(m.cells.every((row) => row.length === s.cols)).toBe(true);
      expect(validateMatrix(m, s)).toEqual([]);
    },
    30000,
  );
});

describe("2. every cell holds one valid palette reference", () => {
  it("indexes are integers inside the palette; palette colors are opaque solids", () => {
    const s = spec("8x10", "portrait", 8);
    const m = convertRaster(gradientPicture(400, 500), DEFAULT_CROP, s);
    for (const row of m.cells) {
      for (const v of row) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(m.palette.length);
      }
    }
    for (const p of m.palette) expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("3. distinct colors never exceed the selected maximum", () => {
  it.each([4, 6, 8, 10] as const)("max %i colors on a busy picture", (max) => {
    const s = spec("12x16", "portrait", max);
    const m = convertRaster(gradientPicture(500, 600), DEFAULT_CROP, s);
    const used = new Set(m.cells.flat());
    expect(used.size).toBeLessThanOrEqual(max);
    expect(m.palette.length).toBeLessThanOrEqual(max);
    expect(validateMatrix(m, s)).toEqual([]);
  });

  it("a one-color picture gives a one-color chart", () => {
    const m = convertRaster(solid(100, 100, RED), DEFAULT_CROP, spec("6x8", "portrait", 10));
    expect(m.palette.length).toBe(1);
  });
});

describe("4. portrait and landscape", () => {
  it("both orientations convert and keep their own shapes", () => {
    const img = geometricShapes(300, 400);
    const p = convertRaster(img, DEFAULT_CROP, spec("12x16", "portrait"));
    const l = convertRaster(img, DEFAULT_CROP, spec("12x16", "landscape"));
    expect([p.cols, p.rows]).toEqual([48, 72]);
    expect([l.cols, l.rows]).toEqual([64, 54]);
  });
});

describe("accuracy on the geometric test picture", () => {
  it("each cell takes the color of the shape under its centre (≥ 93% of cells)", () => {
    const s = spec("12x16", "portrait", 6);
    const m = convertRaster(geometricShapes(600, 800), DEFAULT_CROP, s);
    let good = 0;
    for (let r = 0; r < m.rows; r++) {
      for (let c = 0; c < m.cols; c++) {
        const expected = shapeColorAt((c + 0.5) / m.cols, (r + 0.5) / m.rows);
        if (dist(rgbAt(m, c, r), expected) < 60) good++;
      }
    }
    expect(good / (m.cols * m.rows)).toBeGreaterThanOrEqual(0.93);
    // All five flat colors are found in the palette.
    for (const want of [WHITE, RED, BLUE, GREEN, BLACK]) {
      expect(m.palette.some((p) => dist([p.r, p.g, p.b], want) < 60)).toBe(true);
    }
  });
});

describe("small details are protected", () => {
  it("a lone gold stitch in a dark field survives cleanup", () => {
    const img = solid(240, 320, BLACK);
    // 1 stitch ≈ 1/24 of the width and 1/36 of the height for 6 × 8 in portrait.
    paintRect(img, 11 / 24, 17 / 36, 12 / 24, 18 / 36, GOLD);
    const m = convertRaster(img, DEFAULT_CROP, spec("6x8", "portrait", 4));
    expect(dist(rgbAt(m, 11, 17), GOLD)).toBeLessThan(60);
    expect(dist(rgbAt(m, 3, 3), BLACK)).toBeLessThan(60);
  });

  it("a near-identical stray stitch is merged away", () => {
    const img = solid(240, 320, [60, 60, 60]);
    paintRect(img, 11 / 24, 17 / 36, 12 / 24, 18 / 36, [78, 78, 78]);
    const m = convertRaster(img, DEFAULT_CROP, spec("6x8", "portrait", 4));
    expect(new Set(m.cells.flat()).size).toBe(1);
  });
});

describe("6. transparent regions become opaque, consistently", () => {
  it("fully transparent pixels convert exactly like white", () => {
    const withAlpha: Raster = solid(240, 320, [0, 0, 0], 0); // transparent black
    paintRect(withAlpha, 0.2, 0.2, 0.6, 0.6, RED);
    const onWhite: Raster = solid(240, 320, WHITE);
    paintRect(onWhite, 0.2, 0.2, 0.6, 0.6, RED);
    const s = spec("6x8", "portrait", 4);
    const a = convertRaster(withAlpha, DEFAULT_CROP, s);
    const b = convertRaster(onWhite, DEFAULT_CROP, s);
    expect(a).toEqual(b);
    for (const p of a.palette) expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("7. determinism", () => {
  it("identical inputs give identical matrices, repeatedly", () => {
    const s = spec("16x20", "landscape", 8);
    const img = gradientPicture(500, 400);
    const first = convertRaster(img, DEFAULT_CROP, s);
    for (let i = 0; i < 3; i++) expect(convertRaster(img, DEFAULT_CROP, s)).toEqual(first);
  });

  it("does not modify the input picture", () => {
    const img = geometricShapes(120, 160);
    const copy = new Uint8ClampedArray(img.data);
    convertRaster(img, DEFAULT_CROP, spec("6x8", "portrait"));
    expect(Array.from(img.data)).toEqual(Array.from(copy));
  });
});

describe("8. the largest supported chart", () => {
  it("24 × 32 in landscape is 128 × 108 and converts", () => {
    const s = spec("24x32", "landscape", 10);
    expect([s.cols, s.rows]).toEqual([128, 108]);
    const t0 = Date.now();
    const m = convertRaster(gradientPicture(1600, 1200), DEFAULT_CROP, s);
    const ms = Date.now() - t0;
    expect(validateMatrix(m, s)).toEqual([]);
    expect(ms).toBeLessThan(15000); // generous: this only guards against runaway cost
    console.log(`128 × 108 conversion took ${ms} ms`);
  }, 30000);
});

describe("9. invalid input gives a useful error", () => {
  const s = spec("6x8", "portrait");
  it("rejects a raster whose data length doesn't match its size", () => {
    const bad: Raster = { width: 10, height: 10, data: new Uint8ClampedArray(12) };
    expect(() => convertRaster(bad, DEFAULT_CROP, s)).toThrow(ConversionError);
    expect(() => convertRaster(bad, DEFAULT_CROP, s)).toThrow(/couldn't be read/);
  });
  it("rejects an empty picture", () => {
    const bad: Raster = { width: 0, height: 0, data: new Uint8ClampedArray(0) };
    expect(() => convertRaster(bad, DEFAULT_CROP, s)).toThrow(ConversionError);
  });
  it("rejects a non-whole-number chart size", () => {
    const badSpec = { ...s, cols: 24.5 };
    expect(() => convertRaster(solid(50, 50, RED), DEFAULT_CROP, badSpec)).toThrow(ConversionError);
  });
});
