import { describe, expect, it } from "vitest";
import { buildGridSpec } from "./geometry";
import { FINISHED_SIZES } from "../config/sizes";
import { BLANK_BACKGROUND_SLOT, BLANK_START_COLOR, STARTER_HEXES, makeBlankMatrix } from "./blank";
import { buildPatternModel } from "./export/pattern";
import { colorCounts } from "./editor/paint";

describe("blank canvas", () => {
  it("uses exactly the eight presets and the gauge: the stitch grids in the brief", () => {
    const want: Record<string, [number, number]> = { "6x8": [24, 36], "8x10": [32, 45], "9x16": [36, 72], "12x12": [48, 54], "12x16": [48, 72], "16x20": [64, 90], "18x24": [72, 108], "24x32": [96, 144] };
    expect(FINISHED_SIZES.map((s) => s.id)).toEqual(Object.keys(want));
    for (const s of FINISHED_SIZES) {
      const g = buildGridSpec({ sizeId: s.id, orientation: "portrait", maxColors: 6 });
      expect([g.cols, g.rows]).toEqual(want[s.id]);
      const l = buildGridSpec({ sizeId: s.id, orientation: "landscape", maxColors: 6 });
      expect([l.cols, l.rows]).toEqual([s.height * 4, Math.round(s.width * 4.5)]); // landscape swaps the inches and recalculates from the gauge
    }
  });

  it("is a completely white chart: every stitch holds an assigned color (white), counted exactly", () => {
    const m = makeBlankMatrix(96, 144);
    expect(m.cells).toHaveLength(144);
    expect(m.cells.every((r) => r.length === 96 && r.every((v) => v === BLANK_BACKGROUND_SLOT))).toBe(true);
    expect(m.palette[BLANK_BACKGROUND_SLOT].hex).toBe("#ffffff");
    expect(m.palette).toHaveLength(10);
    expect(colorCounts(m)[0]).toBe(96 * 144);
    // rows are separate arrays (editing one row can never touch another)
    expect(new Set(m.cells).size).toBe(144);
  });

  it("has ten different starter colors: black, red, blue, green, yellow and some neutrals", () => {
    expect(new Set(STARTER_HEXES).size).toBe(10);
    expect(STARTER_HEXES).toEqual(expect.arrayContaining(["#111111", "#d62828", "#1f5fbf", "#2e9e4f", "#f7d21e"]));
    expect(BLANK_START_COLOR).toBe(1); // the brush starts black, not white
    expect(makeBlankMatrix(24, 36).palette[BLANK_START_COLOR].hex).toBe("#111111");
  });

  it("exports as a one-color pattern with every stitch counted, and drops unused colors", () => {
    const model = buildPatternModel(makeBlankMatrix(24, 36));
    expect(model.colors).toHaveLength(1);
    expect(model.colors[0]).toMatchObject({ letter: "A", hex: "#FFFFFF", count: 24 * 36 });
    expect(model.total).toBe(864);
  });

  it("refuses a chart without stitches", () => {
    expect(() => makeBlankMatrix(0, 5)).toThrow();
    expect(() => makeBlankMatrix(5, 2.5)).toThrow();
  });
});
