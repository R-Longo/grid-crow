import { describe, expect, it } from "vitest";
import { FINISHED_SIZES } from "../../config/sizes";
import { buildGridSpec } from "../geometry";
import { DEFAULT_CROP, cropRect, moveCrop, physicalAspect, settleCrop } from "./crop";

describe("5. crop keeps the physical aspect ratio", () => {
  const pictures: Array<[number, number]> = [[4000, 3000], [1000, 1000], [600, 2400], [2048, 2048], [3, 5000]];

  it("12 × 16 in portrait is a 3:4 crop, not 2:3 (even though the grid is 48 × 72)", () => {
    const s = buildGridSpec({ sizeId: "12x16", orientation: "portrait", maxColors: 6 });
    expect([s.cols, s.rows]).toEqual([48, 72]);
    const aspect = physicalAspect(s.widthInches, s.heightInches);
    expect(aspect).toBeCloseTo(3 / 4, 10);
    expect(aspect).not.toBeCloseTo(s.cols / s.rows, 3);
    const r = cropRect(1200, 1200, aspect, DEFAULT_CROP);
    expect(r.w / r.h).toBeCloseTo(3 / 4, 10);
  });

  it.each(FINISHED_SIZES.flatMap((s) => (["portrait", "landscape"] as const).map((o) => [s.id, o] as const)))(
    "%s %s keeps its physical ratio at every zoom and position for all pictures",
    (id, o) => {
      const s = buildGridSpec({ sizeId: id, orientation: o, maxColors: 6 });
      const aspect = physicalAspect(s.widthInches, s.heightInches);
      for (const [w, h] of pictures) {
        for (const zoom of [1, 1.5, 2.5, 4]) {
          for (const [cx, cy] of [[0, 0], [0.5, 0.5], [1, 1], [0.2, 0.9]]) {
            const r = cropRect(w, h, aspect, { zoom, cx, cy });
            expect(r.w / r.h).toBeCloseTo(aspect, 9);
            expect(r.x).toBeGreaterThanOrEqual(-1e-9);
            expect(r.y).toBeGreaterThanOrEqual(-1e-9);
            expect(r.x + r.w).toBeLessThanOrEqual(w + 1e-9);
            expect(r.y + r.h).toBeLessThanOrEqual(h + 1e-9);
          }
        }
      }
    },
  );

  it("zoom 1 uses the largest possible region (no needless cropping)", () => {
    const r = cropRect(4000, 3000, 3 / 4, DEFAULT_CROP);
    expect(r.h).toBeCloseTo(3000, 9);
    expect(r.w).toBeCloseTo(2250, 9);
  });

  it("dragging moves the region and never leaves the picture", () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 };
    const moved = moveCrop(1000, 1000, 3 / 4, start, 100, 0);
    const a = cropRect(1000, 1000, 3 / 4, start);
    const b = cropRect(1000, 1000, 3 / 4, moved);
    expect(b.x - a.x).toBeCloseTo(100, 6);
    const far = moveCrop(1000, 1000, 3 / 4, start, 99999, -99999);
    const r = cropRect(1000, 1000, 3 / 4, far);
    expect(r.x + r.w).toBeLessThanOrEqual(1000 + 1e-9);
    expect(r.y).toBeGreaterThanOrEqual(-1e-9);
  });

  it("settling a crop after the aspect changes keeps it inside the picture", () => {
    const s = settleCrop(1000, 1000, 4 / 3, { zoom: 3, cx: 0.99, cy: 0.01 });
    const r = cropRect(1000, 1000, 4 / 3, s);
    expect(r.x + r.w).toBeLessThanOrEqual(1000 + 1e-9);
    expect(r.y).toBeGreaterThanOrEqual(-1e-9);
  });
});
