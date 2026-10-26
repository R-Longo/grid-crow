import { describe, expect, it } from "vitest";
import { centeredOn, clampPlacement, maskStitches, renderText, supports, wrapToWidth } from "./fonts";
import type { TextStyle } from "./fonts";

const std: TextStyle = { font: "standard", scale: 1, bold: false };
const mini: TextStyle = { font: "mini", scale: 1, bold: false };
const show = (m: NonNullable<ReturnType<typeof renderText>>) => m.rows.map((r) => r.map((x) => (x ? "#" : ".")).join("")).join("\n");

describe("stitch fonts", () => {
  it("draws a letter on its 5 x 7 grid", () => {
    const m = renderText("H", std)!;
    expect([m.width, m.height]).toEqual([5, 7]);
    expect(show(m)).toBe(["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"].join("\n"));
  });
  it("leaves one empty stitch between letters and a gap for a space", () => {
    expect(renderText("HI", std)!.width).toBe(5 + 1 + 5);
    expect(renderText("H I", std)!.width).toBe(5 + 1 + 3 + 1 + 5);
    expect(renderText("HI", mini)!.width).toBe(3 + 1 + 3);
  });
  it("every capital, digit and punctuation mark is a clean rectangle of the font's height", () => {
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-:'&+/()") {
      const m = renderText(ch, std)!;
      expect(m.height, ch).toBe(7);
      expect(m.rows.every((r) => r.length === m.width), ch).toBe(true);
      expect(m.rows.flat().some(Boolean), ch).toBe(true);
    }
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-:'") {
      const m = renderText(ch, mini)!;
      expect(m.height, ch).toBe(5);
      expect(m.rows.every((r) => r.length === m.width), ch).toBe(true);
    }
  });
  it("lowercase prints as capitals, and what it cannot draw shows as ? and is counted", () => {
    expect(show(renderText("hello", std)!)).toBe(show(renderText("HELLO", std)!));
    const m = renderText("a~b", std)!;
    expect(m.substituted).toBe(1);
    expect(supports("~")).toBe(false);
    expect(supports("g")).toBe(true);
  });
  it("enlarges by whole stitches and thickens when bold", () => {
    const one = renderText("L", std)!;
    const two = renderText("L", { ...std, scale: 2 })!;
    expect([two.width, two.height]).toEqual([one.width * 2, one.height * 2]);
    expect(two.rows.flat().filter(Boolean).length).toBe(one.rows.flat().filter(Boolean).length * 4);
    expect(renderText("L", { ...std, bold: true })!.width).toBe(one.width + 1);
  });
  it("stacks lines, centred, and ignores empty text", () => {
    const m = renderText("HI\nA", std)!;
    expect(m.height).toBe(7 + 2 + 7);
    expect(renderText("   ", std)).toBeNull();
    expect(renderText("", std)).toBeNull();
  });
  it("keeps text inside the chart, or says it does not fit", () => {
    const m = renderText("HI", std)!;
    expect(clampPlacement(m, -5, -5, 20, 20)).toEqual({ col: 0, row: 0 });
    expect(clampPlacement(m, 99, 99, 20, 20)).toEqual({ col: 20 - m.width, row: 13 });
    expect(clampPlacement(m, 0, 0, 8, 20)).toBeNull();
    expect(centeredOn(m, 10, 10)).toEqual({ col: 10 - 5, row: 10 - 3 });
    expect(maskStitches(renderText("I", mini)!, 2, 3)).toHaveLength(renderText("I", mini)!.rows.flat().filter(Boolean).length);
  });
  it("wraps words onto new lines to fit the chart width", () => {
    expect(wrapToWidth("CAT TAROT", std, 48)).toBe("CAT\nTAROT");
    expect(wrapToWidth("CAT", std, 48)).toBe("CAT");
    expect(wrapToWidth("HI\nYOU", std, 48)).toBe("HI\nYOU");
    expect(wrapToWidth("ABCDEFGHIJ", std, 20)).toBe("ABCDEFGHIJ");
    expect(renderText(wrapToWidth("CAT TAROT", std, 48), std)!.width).toBeLessThanOrEqual(48);
  });
});
