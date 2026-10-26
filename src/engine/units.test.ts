import { describe, expect, it } from "vitest";
import { CM_PER_INCH, METERS_PER_YARD, defaultUnits, fromInches, gaugePer, lengthNumber, sizeText, toInches, yarnAmount } from "./units";
import { convertRaw, parseManual, rawFromCustom, standardSwatch } from "./manual";
import { describeGauge } from "./gauge";
import { makeBlankMatrix } from "./blank";
import { buildPatternModel, finishedLine, gaugeLine, yardsText, yarnNote } from "./export/pattern";
import { sizeOptions } from "../config/options";

describe("units", () => {
  it("guesses units from the language, and the person can always switch", () => {
    expect(defaultUnits("en-US")).toBe("imperial");
    expect(defaultUnits(undefined)).toBe("imperial");
    expect(defaultUnits("en-US@posix")).toBe("imperial");
    expect(defaultUnits("en_US")).toBe("imperial");
    for (const l of ["en-GB", "en-AU", "en-CA", "fr-FR", "de-DE", "es-MX", "ja-JP"]) expect(defaultUnits(l), l).toBe("metric");
  });
  it("converts lengths both ways", () => {
    expect(fromInches(10, "metric")).toBeCloseTo(25.4, 10);
    expect(toInches(25.4, "metric")).toBeCloseTo(10, 10);
    expect(toInches(7, "imperial")).toBe(7);
    expect(CM_PER_INCH).toBe(2.54);
  });
  it("writes sizes the way people read them", () => {
    expect(sizeText(12, 16, "imperial")).toBe("12 × 16 in");
    expect(sizeText(12, 16, "metric")).toBe("30 × 41 cm");
    expect(sizeText(1, 2, "metric")).toBe("2.5 × 5.1 cm");
    expect(lengthNumber(20, "imperial")).toBe("20");
  });
  it("rounds yarn up to whole meters, and leaves yards alone", () => {
    expect(yarnAmount(100, "imperial")).toBe(100);
    expect(yarnAmount(100, "metric")).toBe(92); // 91.44 m rounded up
    expect(yarnAmount(0, "metric")).toBe(0);
    expect(METERS_PER_YARD).toBe(0.9144);
    expect(yardsText(40, 60, "metric")).toBe("37–55 m");
    expect(yardsText(40, 60)).toBe("40–60 yd");
    expect(yardsText(1, 1, "metric")).toBe("1 m");
  });
  it("gives gauge per inch, or per 10 cm", () => {
    const p = gaugePer({ stitchesPerInch: 4, rowsPerInch: 4.5 }, "metric");
    expect(p.per).toBe("10 cm");
    expect(p.stitches).toBeCloseTo(15.748, 2);
    expect(p.rows).toBeCloseTo(17.717, 2);
    expect(describeGauge({ stitchesPerInch: 5, rowsPerInch: 6 })).toBe("5 stitches and 6 rows per inch");
    expect(describeGauge({ stitchesPerInch: 4, rowsPerInch: 4.5 }, "metric")).toBe("15.75 stitches and 17.72 rows per 10 cm");
  });
});

describe("Manual Mode in centimeters", () => {
  it("the same swatch and size give the same chart as in inches", () => {
    const inch = parseManual({ sw: "10", swIn: "2", sh: "12", shIn: "2", w: "20", h: "24" }, "imperial");
    const cm = parseManual({ sw: "10", swIn: "5.08", sh: "12", shIn: "5.08", w: "50.8", h: "60.96" }, "metric");
    expect([cm.cols, cm.rows]).toEqual([inch.cols, inch.rows]);
    expect(cm.gauge!.stitchesPerInch).toBeCloseTo(5, 10);
    expect(cm.custom!.widthInches).toBeCloseTo(20, 10);
  });
  it("the standard-gauge button is the standard gauge in either unit", () => {
    const m = parseManual({ ...standardSwatch("metric"), w: "30.48", h: "40.64" }, "metric");
    expect(m.gauge!.stitchesPerInch).toBeCloseTo(4, 2);
    expect(m.gauge!.rowsPerInch).toBeCloseTo(4.5, 2);
    expect([m.cols, m.rows]).toEqual([48, 72]);
  });
  it("switching units keeps the measurements and does not drift", () => {
    const raw = { sw: "10", swIn: "2", sh: "12", shIn: "2", w: "20", h: "24" };
    const there = convertRaw(raw, "imperial", "metric");
    expect(there.w).toBe("50.8");
    expect(there.sw).toBe("10"); // stitch counts are not lengths
    const back = convertRaw(there, "metric", "imperial");
    expect(back).toEqual(raw);
    expect(convertRaw({ ...raw, w: "abc" }, "imperial", "metric").w).toBe("abc");
  });
  it("problems are worded in the unit being typed", () => {
    expect(parseManual({ sw: "10", swIn: "2.5", sh: "10", shIn: "2.5", w: "50", h: "" }, "metric").sizeProblem).toMatch(/centimeters/);
    expect(parseManual({ sw: "10", swIn: "2.5", sh: "10", shIn: "2.5", w: "1", h: "1" }, "metric").sizeProblem).toMatch(/between 3 and 305 centimeters/);
  });
  it("a saved custom size comes back in the shown unit", () => {
    const c = { widthInches: 20, heightInches: 24, stitchesPerInch: 5, rowsPerInch: 6 };
    const r = parseManual(rawFromCustom(c, "metric"), "metric");
    expect(r.custom!.widthInches).toBeCloseTo(20, 1);
    expect(r.custom!.stitchesPerInch).toBeCloseTo(5, 1);
  });
});

describe("printed patterns in centimeters", () => {
  const m = makeBlankMatrix(48, 72);
  it("say centimeters and meters, and keep the counts", () => {
    const model = buildPatternModel(m, "metric");
    expect(model.units).toBe("metric");
    expect(finishedLine(model)).toBe("Finished size about 30 × 41 cm");
    expect(gaugeLine(model.gauge, "metric")).toContain("(about 10 cm)");
    expect(yarnNote(model)).toMatch(/centimeters of yarn per stitch/);
    expect(model.cols).toBe(48);
  });
  it("imperial patterns are word for word what they were", () => {
    const model = buildPatternModel(m);
    expect(finishedLine(model)).toBe("Finished size about 12 × 16 inches");
    expect(gaugeLine()).toBe("Reference gauge: 16 stitches × 18 rows per 4 inches, using worsted-weight #4 yarn and a 5 mm hook.");
    expect(yarnNote(model)).toMatch(/inches of yarn per stitch/);
  });
  it("preset buttons read in centimeters", () => {
    const labels = sizeOptions("portrait", "metric").map((o) => o.label);
    expect(labels).toEqual(["15 × 20 cm", "20 × 25 cm", "23 × 41 cm", "30 × 30 cm", "30 × 41 cm", "41 × 51 cm", "46 × 61 cm", "61 × 81 cm"]);
    expect(sizeOptions("portrait")[0].label).toBe("6 × 8 in");
  });
});
