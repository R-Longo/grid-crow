import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { countStitchesAndCarry, estimateYarn, skeinsFor } from "./estimate";

const pal = (hex: string) => ({ r: 0, g: 0, b: 0, hex });
const m = (cells: number[][]): StitchMatrix => ({ cols: cells[0].length, rows: cells.length, palette: [pal("#ffffff"), pal("#000000"), pal("#ff0000")], cells });

describe("yarn estimate", () => {
  it("counts stitches and the stitches a color is carried across", () => {
    const { stitches, carried } = countStitchesAndCarry(m([[0, 1, 0, 1, 0], [0, 0, 0, 0, 0]]));
    expect(stitches).toEqual([8, 2, 0]);
    expect(carried[1]).toBe(1); // black spans stitches 2..4, one white stitch between
    expect(carried[0]).toBe(2); // white spans all 5 stitches of row 1 and works 3 of them
  });
  it("gives a range that rises with stitch count and is in whole yards", () => {
    const e = estimateYarn(m(Array.from({ length: 20 }, () => new Array<number>(20).fill(0))));
    expect(e.colors).toHaveLength(1);
    expect(e.lowYards).toBeLessThan(e.highYards);
    expect(Number.isInteger(e.lowYards)).toBe(true);
    // 400 stitches x 2.0 to 3.0 in, plus 15%: about 26 to 39 yd
    expect(e.lowYards).toBe(Math.ceil((400 * 2 * 1.15) / 36));
    expect(e.highYards).toBe(Math.ceil((400 * 3 * 1.15) / 36));
  });
  it("leaves out unused colors and sorts by stitches", () => {
    const e = estimateYarn(m([[1, 1, 1, 0]]));
    expect(e.colors.map((c) => c.hex)).toEqual(["#000000", "#ffffff"]);
  });
  it("skeins", () => {
    expect(skeinsFor(210, 200)).toBe(2);
    expect(skeinsFor(5, 200)).toBe(1);
    expect(skeinsFor(5, 0)).toBe(0);
  });
});

import { buildPatternModel, yardsText, yarnNote } from "../export/pattern";
describe("yarn in the exported pattern", () => {
  it("the model's per-color yards add up to the total, and the wording is plain about being an estimate", () => {
    const model = buildPatternModel(m([[0, 1, 0, 1, 0, 2], [0, 0, 0, 0, 0, 0]]));
    expect(model.colors.reduce((s, c) => s + c.lowYards, 0)).toBe(model.lowYards);
    expect(model.colors.reduce((s, c) => s + c.highYards, 0)).toBe(model.highYards);
    expect(yardsText(5, 8)).toBe("5–8 yd");
    expect(yardsText(1, 1)).toBe("1 yd");
    expect(yarnNote(model)).toMatch(/rough estimate, not a measurement/i);
    expect(yarnNote(model)).toContain("2 to 3 inches");
  });
});
