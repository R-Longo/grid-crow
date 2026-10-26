import { describe, expect, it } from "vitest";
import { REFERENCE_GAUGE, ROWS_PER_INCH, STANDARD_GAUGE, STITCHES_PER_INCH } from "../config/gauge";
import { FINISHED_SIZES } from "../config/sizes";
import type { FinishedSizeId } from "../config/sizes";
import { buildGridSpec, finishedDimensions, formatFinishedSize, formatStitchGrid } from "./geometry";
import type { MaxColors, Orientation } from "../types";

// Expected results copied from the Stage 2 brief (NOT computed by the code under test).
// [size id, portrait W×H in, landscape W×H in, portrait cols×rows, landscape cols×rows]
const EXPECTED: [FinishedSizeId, [number, number], [number, number], [number, number], [number, number]][] = [
  ["6x8", [6, 8], [8, 6], [24, 36], [32, 27]],
  ["8x10", [8, 10], [10, 8], [32, 45], [40, 36]],
  ["9x16", [9, 16], [16, 9], [36, 72], [64, 41]],
  ["12x12", [12, 12], [12, 12], [48, 54], [48, 54]],
  ["12x16", [12, 16], [16, 12], [48, 72], [64, 54]],
  ["16x20", [16, 20], [20, 16], [64, 90], [80, 72]],
  ["18x24", [18, 24], [24, 18], [72, 108], [96, 81]],
  ["24x32", [24, 32], [32, 24], [96, 144], [128, 108]],
];

const spec = (sizeId: FinishedSizeId, orientation: Orientation, maxColors: MaxColors = 6) =>
  buildGridSpec({ sizeId, orientation, maxColors });

describe("reference gauge", () => {
  it("is worsted #4, 5 mm, 16 sc × 18 rows per 4 in → 4 st/in and 4.5 rows/in", () => {
    expect(STANDARD_GAUGE.yarnLabel).toBe("Worsted weight #4");
    expect(STANDARD_GAUGE.hookLabel).toBe("5 mm");
    expect(STITCHES_PER_INCH).toBe(4);
    expect(ROWS_PER_INCH).toBe(4.5);
    expect(REFERENCE_GAUGE.stitchesPerInch).toBe(4);
    expect(REFERENCE_GAUGE.rowsPerInch).toBe(4.5);
  });
});

describe("size presets", () => {
  it("are exactly the eight approved sizes", () => {
    expect(FINISHED_SIZES.map((s) => s.id)).toEqual(EXPECTED.map((e) => e[0]));
  });
});

describe.each(EXPECTED)("size %s", (id, portraitIn, landscapeIn, portraitGrid, landscapeGrid) => {
  it("portrait: physical size and stitch grid are correct", () => {
    const s = spec(id, "portrait");
    expect([s.widthInches, s.heightInches]).toEqual(portraitIn);
    expect([s.cols, s.rows]).toEqual(portraitGrid);
  });

  it("landscape: width/height reverse and the grid matches the brief", () => {
    const s = spec(id, "landscape");
    expect([s.widthInches, s.heightInches]).toEqual(landscapeIn);
    expect([s.cols, s.rows]).toEqual(landscapeGrid);
  });

  it("landscape is recalculated from gauge, not transposed from portrait", () => {
    const p = spec(id, "portrait");
    const l = spec(id, "landscape");
    // Stitches and rows have different gauges, so a transpose would be wrong.
    expect([l.cols, l.rows]).not.toEqual([p.rows, p.cols]);
    expect(l.cols).toBe(Math.round(p.heightInches * STITCHES_PER_INCH));
    expect(l.rows).toBe(Math.round(p.widthInches * ROWS_PER_INCH));
  });

  it("always yields whole-number stitches and rows, with no rounding needed", () => {
    for (const o of ["portrait", "landscape"] as const) {
      const s = spec(id, o);
      expect(Number.isInteger(s.cols)).toBe(true);
      expect(Number.isInteger(s.rows)).toBe(true);
      // the product is already whole, so round() is not hiding a fractional stitch
      // (one exception: 9 inches at 4.5 rows an inch is 40.5 rows, so 9 x 16 landscape rounds up by half a row)
      expect(s.widthInches * STITCHES_PER_INCH).toBe(s.cols);
      if (id === "9x16" && o === "landscape") expect(s.heightInches * ROWS_PER_INCH).toBe(s.rows - 0.5);
      else expect(s.heightInches * ROWS_PER_INCH).toBe(s.rows);
    }
  });

  it("switching orientation back and forth gives identical results", () => {
    const first = spec(id, "portrait");
    spec(id, "landscape");
    expect(spec(id, "portrait")).toEqual(first);
  });
});

describe("GridSpec contents", () => {
  it("carries preset, orientation, dimensions, counts, gauge and max colors", () => {
    const s = spec("12x16", "landscape", 8);
    expect(s).toEqual({
      sizeId: "12x16",
      orientation: "landscape",
      widthInches: 16,
      heightInches: 12,
      cols: 64,
      rows: 54,
      gauge: REFERENCE_GAUGE,
      maxColors: 8,
    });
  });

  it("preserves the selected maximum color count for every size and orientation", () => {
    for (const colors of [4, 6, 8, 10] as const) {
      for (const [id] of EXPECTED) {
        for (const o of ["portrait", "landscape"] as const) {
          expect(spec(id, o, colors).maxColors).toBe(colors);
        }
      }
    }
  });

  it("rejects an unknown size", () => {
    expect(() => finishedDimensions("1x1" as FinishedSizeId, "portrait")).toThrow();
  });
});

describe("summary text", () => {
  it("12 × 16 portrait", () => {
    const s = spec("12x16", "portrait");
    expect(formatFinishedSize(s)).toBe("12 × 16 inches");
    expect(formatStitchGrid(s)).toBe("48 stitches × 72 rows");
  });
  it("12 × 16 landscape", () => {
    const s = spec("12x16", "landscape");
    expect(formatFinishedSize(s)).toBe("16 × 12 inches");
    expect(formatStitchGrid(s)).toBe("64 stitches × 54 rows");
  });
});
