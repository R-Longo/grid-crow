import { describe, expect, it } from "vitest";
import { COMPACT_PROFILE, LARGE_PROFILE, tiledPageCount, tilePlanFor } from "./tiled";
import { MIN_LETTER_CELL } from "./fit";

describe("Compact PDF profile", () => {
  it("prints the biggest chart (96 x 144) on fewer pages than Large print", () => {
    expect(tiledPageCount(96, 144, LARGE_PROFILE)).toBe(17);
    expect(tiledPageCount(96, 144, COMPACT_PROFILE)).toBe(10);
  });
  it("is never more pages than Large print, at every size", () => {
    for (const [c, r] of [[24, 36], [32, 45], [48, 72], [64, 90], [72, 108], [96, 144], [144, 96]]) {
      expect(tiledPageCount(c, r, COMPACT_PROFILE)).toBeLessThanOrEqual(tiledPageCount(c, r, LARGE_PROFILE));
    }
  });
  it("keeps the stitch shape (9:8) and fits a Letter page with room for the join notes", () => {
    expect(COMPACT_PROFILE.cellW / COMPACT_PROFILE.cellH).toBe(9 / 8);
    expect(COMPACT_PROFILE.maxCols * COMPACT_PROFILE.cellW).toBeLessThanOrEqual(500);
    expect(COMPACT_PROFILE.maxRows * COMPACT_PROFILE.cellH).toBeLessThanOrEqual(620);
  });
  it("still has room for the color letter inside each stitch", () => {
    expect(COMPACT_PROFILE.cellW).toBeGreaterThanOrEqual(MIN_LETTER_CELL);
    expect(COMPACT_PROFILE.letterSize).toBeLessThanOrEqual(COMPACT_PROFILE.cellH * 0.7);
  });
  it("puts every stitch on exactly one page", () => {
    const model = { cols: 96, rows: 144 } as Parameters<typeof tilePlanFor>[0];
    const plan = tilePlanFor(model, COMPACT_PROFILE);
    let n = 0;
    for (const t of plan.tiles) n += (t.c1 - t.c0) * (t.r1 - t.r0);
    expect(n).toBe(96 * 144);
  });
});
