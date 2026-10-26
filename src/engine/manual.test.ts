import { describe, expect, it } from "vitest";
import { EMPTY_MANUAL, STANDARD_SWATCH, parseManual, rawFromCustom, typed } from "./manual";

const ok = { sw: "10", swIn: "2.5", sh: "10", shIn: "2.5", w: "20", h: "24" };

describe("Manual Mode numbers", () => {
  it("reads typed numbers, with a comma for a point, and refuses anything else", () => {
    expect(typed("2.5")).toBe(2.5);
    expect(typed(" 2,5 ")).toBe(2.5);
    expect(typed("10")).toBe(10);
    for (const bad of ["", "abc", "-3", "1e3", "2.5.1", ".", "0x10"]) expect(typed(bad), bad).toBeNull();
  });
  it("works out the gauge, the stitches and the finished size", () => {
    const r = parseManual(ok);
    expect(r.gauge).toEqual({ stitchesPerInch: 4, rowsPerInch: 4 });
    expect([r.cols, r.rows]).toEqual([80, 96]);
    expect([r.actualWidth, r.actualHeight]).toEqual([20, 24]);
    expect(r.custom).toEqual({ widthInches: 20, heightInches: 24, stitchesPerInch: 4, rowsPerInch: 4 });
  });
  it("the standard-gauge button gives the standard gauge", () => {
    const r = parseManual({ ...STANDARD_SWATCH, w: "12", h: "16" });
    expect(r.gauge).toEqual({ stitchesPerInch: 4, rowsPerInch: 4.5 });
    expect([r.cols, r.rows]).toEqual([48, 72]);
  });
  it("says what is missing without complaining before anything is typed", () => {
    const empty = parseManual(EMPTY_MANUAL);
    expect(empty.gaugeProblem).toBe("");
    expect(empty.sizeProblem).toBe("");
    expect(empty.custom).toBeNull();
    expect(parseManual({ ...ok, sh: "" }).gaugeProblem).toMatch(/all four/);
    expect(parseManual({ ...ok, w: "20", h: "" }).sizeProblem).toMatch(/both a width and a height/);
  });
  it("catches a typing mistake in the swatch", () => {
    const r = parseManual({ ...ok, sw: "100", swIn: "1" });
    expect(r.gauge).toBeNull();
    expect(r.gaugeProblem).toMatch(/don't look right/);
    expect(r.custom).toBeNull();
  });
  it("refuses a size outside the sensible range or bigger than the editor supports", () => {
    expect(parseManual({ ...ok, w: "0.5" }).sizeProblem).toMatch(/between 1 and/);
    expect(parseManual({ ...ok, w: "500" }).sizeProblem).toMatch(/between 1 and/);
    const big = parseManual({ ...ok, w: "60", h: "24" }); // 60 in at 4 st/in = 240 stitches
    expect(big.sizeProblem).toMatch(/up to 200/);
    expect(big.custom).toBeNull();
  });
  it("the finished size reports what the whole stitches really make", () => {
    const r = parseManual({ sw: "10", swIn: "2", sh: "10", shIn: "2", w: "10.1", h: "10" }); // 5 st/in: 50.5 stitches rounds to 51 (Math.round)
    expect(r.cols).toBe(51);
    expect(r.actualWidth).toBeCloseTo(10.2, 10);
  });
  it("a saved custom size comes back as the same numbers", () => {
    const r = parseManual(rawFromCustom({ widthInches: 20, heightInches: 24, stitchesPerInch: 5, rowsPerInch: 6 }));
    expect(r.custom).toEqual({ widthInches: 20, heightInches: 24, stitchesPerInch: 5, rowsPerInch: 6 });
  });
});
