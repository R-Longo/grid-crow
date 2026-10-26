import { describe, expect, it } from "vitest";
import { aspectOf, DEFAULT_GAUGE, describeGauge, gaugeFromSwatch, gaugeOf, isDefaultGauge, sizeInches, stitchesForSize, validGauge } from "./gauge";
import { buildGridSpec } from "./geometry";
import { makeBlankMatrix } from "./blank";
import { paintStitches } from "./editor/paint";
import { floodFill } from "./editor/fill";
import { buildPatternModel, gaugeLine } from "./export/pattern";
import { estimateYarn } from "./yarn/estimate";
import { packMatrix, parseProjectJson, projectToJson, unpackMatrix } from "./project/format";
import type { ProjectData } from "./project/format";
import { adaptProfile, COMPACT_PROFILE, LARGE_PROFILE, tilePlanFor } from "./export/pdf/tiled";

const MINE = { stitchesPerInch: 5, rowsPerInch: 6 };

describe("gauge maths", () => {
  it("the default gauge is 4 stitches and 4.5 rows per inch, a 1.125 stitch", () => {
    expect(DEFAULT_GAUGE).toEqual({ stitchesPerInch: 4, rowsPerInch: 4.5 });
    expect(aspectOf(DEFAULT_GAUGE)).toBe(1.125);
    expect(isDefaultGauge(DEFAULT_GAUGE)).toBe(true);
    expect(isDefaultGauge(MINE)).toBe(false);
  });
  it("works a gauge out from a measured swatch", () => {
    expect(gaugeFromSwatch(10, 2.5, 10, 2.5)).toEqual({ stitchesPerInch: 4, rowsPerInch: 4 });
    expect(gaugeFromSwatch(12, 2, 15, 2.5)).toEqual({ stitchesPerInch: 6, rowsPerInch: 6 });
    expect(gaugeFromSwatch(0, 2, 10, 2)).toBeNull();
    expect(gaugeFromSwatch(10, 0, 10, 2)).toBeNull();
    expect(gaugeFromSwatch(10, NaN, 10, 2)).toBeNull();
    expect(gaugeFromSwatch(100, 1, 10, 2)).toBeNull(); // 100 stitches an inch is a typing mistake
  });
  it("turns inches into stitches and back", () => {
    expect(stitchesForSize(20, 24, MINE)).toEqual({ cols: 100, rows: 144 });
    expect(sizeInches(100, 144, MINE)).toEqual({ widthInches: 20, heightInches: 24 });
    expect(stitchesForSize(0.01, 0.01, MINE)).toEqual({ cols: 1, rows: 1 });
  });
  it("describes and validates", () => {
    expect(describeGauge(MINE)).toBe("5 stitches and 6 rows per inch");
    expect(describeGauge({ stitchesPerInch: 4.333333, rowsPerInch: 5 })).toBe("4.33 stitches and 5 rows per inch");
    expect(validGauge(MINE)).toBe(true);
    expect(validGauge({ stitchesPerInch: 0, rowsPerInch: 5 })).toBe(false);
    expect(validGauge({ stitchesPerInch: 5 })).toBe(false);
    expect(gaugeOf({})).toEqual(DEFAULT_GAUGE);
    expect(gaugeOf({ gauge: MINE })).toEqual(MINE);
  });
});

describe("a chart made at your own gauge", () => {
  const spec = buildGridSpec({ orientation: "portrait", sizeId: "custom", maxColors: 6, custom: { widthInches: 20, heightInches: 24, ...MINE } });
  it("gets its stitch grid from your gauge", () => {
    expect([spec.cols, spec.rows]).toEqual([100, 144]);
    expect([spec.widthInches, spec.heightInches]).toEqual([20, 24]);
    expect(spec.sizeId).toBe("custom");
  });
  it("a standard-gauge chart carries no gauge, so it is exactly what it always was", () => {
    expect(makeBlankMatrix(10, 10).gauge).toBeUndefined();
    expect(makeBlankMatrix(10, 10, DEFAULT_GAUGE).gauge).toBeUndefined();
    expect(makeBlankMatrix(10, 10, MINE).gauge).toEqual(MINE);
  });
  it("keeps its gauge through painting and filling", () => {
    const m = makeBlankMatrix(6, 6, MINE);
    const p = paintStitches(m, [{ col: 1, row: 1 }], 1);
    expect(p.matrix.gauge).toEqual(MINE);
    expect(floodFill(p.matrix, { col: 4, row: 4 }, 2).matrix.gauge).toEqual(MINE);
  });
  it("the pattern, finished size and yarn follow the gauge", () => {
    const m = makeBlankMatrix(100, 144, MINE);
    const model = buildPatternModel(m);
    expect([model.widthInches, model.heightInches]).toEqual([20, 24]);
    expect(model.aspect).toBeCloseTo(1.2, 10);
    expect(gaugeLine(model.gauge)).toContain("5 stitches and 6 rows per inch");
    expect(gaugeLine()).toContain("16 stitches × 18 rows per 4 inches");
    // narrower stitches use less yarn each: the same chart at 5 st/in needs less than at 4 st/in
    const tight = estimateYarn(makeBlankMatrix(50, 50, { stitchesPerInch: 5, rowsPerInch: 5 }));
    const loose = estimateYarn(makeBlankMatrix(50, 50));
    expect(tight.highYards).toBeLessThan(loose.highYards);
  });
  it("is saved and opened again with its gauge and custom size", () => {
    const converted = makeBlankMatrix(100, 144, MINE);
    const p: ProjectData = {
      id: "x", name: "Sweater back", kind: "blank", createdAt: 1, updatedAt: 1,
      settings: { orientation: "portrait", sizeId: "custom", maxColors: 6, custom: { widthInches: 20, heightInches: 24, ...MINE } },
      strengthen: false, crop: { zoom: 1, cx: 0.5, cy: 0.5 }, aspect: 0.83,
      converted: packMatrix(converted), current: packMatrix(converted), progress: 0, image: null,
    };
    const back = parseProjectJson(projectToJson(p), "y");
    expect(back.settings.custom).toEqual({ widthInches: 20, heightInches: 24, ...MINE });
    expect(unpackMatrix(back.current).gauge).toEqual(MINE);
  });
  it("refuses a saved project whose gauge or size is nonsense", () => {
    const converted = makeBlankMatrix(100, 144, MINE);
    const base = (custom: object) => ({
      id: "x", name: "n", kind: "blank" as const, createdAt: 1, updatedAt: 1,
      settings: { orientation: "portrait" as const, sizeId: "custom" as const, maxColors: 6 as const, custom: custom as never },
      strengthen: false, crop: { zoom: 1, cx: 0.5, cy: 0.5 }, aspect: 0.83,
      converted: packMatrix(converted), current: packMatrix(converted), progress: 0, image: null,
    });
    expect(() => parseProjectJson(projectToJson(base({ widthInches: 20, heightInches: 24, stitchesPerInch: 0, rowsPerInch: 6 })), "y")).toThrow();
    expect(() => parseProjectJson(projectToJson(base({ widthInches: 400, heightInches: 400, stitchesPerInch: 12, rowsPerInch: 14 })), "y")).toThrow(); // bigger than GridCrow supports
  });
});

describe("printing at your own gauge", () => {
  it("the standard gauge keeps the standard pages exactly", () => {
    expect(adaptProfile(LARGE_PROFILE, DEFAULT_GAUGE)).toBe(LARGE_PROFILE);
    expect(adaptProfile(COMPACT_PROFILE, DEFAULT_GAUGE)).toBe(COMPACT_PROFILE);
  });
  it("large print draws each stitch at its real size, and every stitch lands on exactly one page", () => {
    const P = adaptProfile(LARGE_PROFILE, MINE);
    expect(72 / P.cellW).toBeCloseTo(5, 10);
    expect(72 / P.cellH).toBeCloseTo(6, 10);
    expect(P.maxCols * P.cellW).toBeLessThanOrEqual(27 * 18 + 1e-6);
    expect(P.maxRows * P.cellH).toBeLessThanOrEqual(38 * 16 + 1e-6);
    expect(adaptProfile(P, MINE)).toEqual(P); // adapting twice changes nothing
    const model = buildPatternModel(makeBlankMatrix(100, 144, MINE));
    const plan = tilePlanFor(model, LARGE_PROFILE);
    expect(plan.tiles.reduce((n, t) => n + (t.c1 - t.c0) * (t.r1 - t.r0), 0)).toBe(100 * 144);
  });
});
