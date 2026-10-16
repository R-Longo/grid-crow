import { describe, expect, it } from "vitest";
import { buildGridSpec } from "../geometry";
import type { MaxColors, Orientation } from "../../types";
import { convertRaster } from "./convert";
import { DEFAULT_CROP, cropRect, physicalAspect } from "./crop";
import { EYES, geometricShapes, neutralSubjectWithBlueEyes, neutralWithBlueNoise, solid, paintRect, BLACK, GOLD } from "./testImages";
import type { RGB } from "./testImages";
import { validateMatrix } from "./validate";
import type { StitchMatrix } from "./types";

const spec = (sizeId: Parameters<typeof buildGridSpec>[0]["sizeId"], orientation: Orientation, maxColors: MaxColors) =>
  buildGridSpec({ sizeId, orientation, maxColors });

/** "Visibly blue": the blue channel clearly leads red, and it isn't just a gray. */
const isBlue = ([r, g, b]: RGB) => b - r >= 25 && b >= g;
const rgbOf = (m: StitchMatrix, c: number, r: number): RGB => {
  const p = m.palette[m.cells[r][c]];
  return [p.r, p.g, p.b];
};

const PIC_W = 600;
const PIC_H = 800;

/** Blue stitches within a window around an eye. The eye's position is mapped through the crop. */
function blueNearEye(m: StitchMatrix, eyeInPicture: [number, number], s: ReturnType<typeof spec>, reach = 0.06): number {
  const r0 = cropRect(PIC_W, PIC_H, physicalAspect(s.widthInches, s.heightInches), DEFAULT_CROP);
  const eye: [number, number] = [(eyeInPicture[0] * PIC_W - r0.x) / r0.w, (eyeInPicture[1] * PIC_H - r0.y) / r0.h];
  let n = 0;
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (Math.abs((c + 0.5) / m.cols - eye[0]) > reach || Math.abs((r + 0.5) / m.rows - eye[1]) > reach) continue;
      if (isBlue(rgbOf(m, c, r))) n++;
    }
  }
  return n;
}
const blueTotal = (m: StitchMatrix) => m.cells.flat().filter((v) => isBlue([m.palette[v].r, m.palette[v].g, m.palette[v].b])).length;

describe("small distinctive colors survive (kitten-eye regression)", () => {
  const img = neutralSubjectWithBlueEyes();

  it.each([
    ["16x20", "portrait", 8],
    ["16x20", "portrait", 10],
    // 6 colours: the real-photo kitten test covers it. This synthetic subject has no spare gray slot to give up,
    // so it is a documented limit (see docs), not a guarantee.
    ["12x16", "portrait", 8],
    ["12x16", "portrait", 10],
    ["24x32", "landscape", 8],
  ] as const)("%s %s with %i colors keeps blue stitches in BOTH eyes", (size, orientation, max) => {
    const s = spec(size, orientation, max);
    const m = convertRaster(img, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    expect(m.palette.some(isBluePalette)).toBe(true);
    for (const eye of EYES) expect(blueNearEye(m, eye, s)).toBeGreaterThanOrEqual(2);
  });

  it("the blue is a real palette slot, still within the maximum, and not scattered around the picture", () => {
    const s = spec("16x20", "portrait", 8);
    const m = convertRaster(img, DEFAULT_CROP, s);
    expect(m.palette.length).toBeLessThanOrEqual(8);
    const nearEyes = EYES.reduce((n, e) => n + blueNearEye(m, e, s), 0);
    expect(blueTotal(m)).toBe(nearEyes); // every blue stitch is in an eye
  });

  it("is deterministic with the rescue in place", () => {
    const s = spec("16x20", "portrait", 8);
    expect(convertRaster(img, DEFAULT_CROP, s)).toEqual(convertRaster(img, DEFAULT_CROP, s));
  });
});

describe("limits: what the rescue deliberately does NOT do", () => {
  it("does not add blue for scattered one-pixel noise", () => {
    const s = spec("16x20", "portrait", 10);
    const m = convertRaster(neutralWithBlueNoise(), DEFAULT_CROP, s);
    expect(blueTotal(m)).toBe(0);
  });

  it("cannot keep a feature far smaller than one stitch", () => {
    // Iris radius 0.4% of the width ≈ a quarter of a 16 × 20 in stitch: too small to be a stitch.
    const s = spec("16x20", "portrait", 10);
    const m = convertRaster(neutralSubjectWithBlueEyes(600, 800, 0.004), DEFAULT_CROP, s);
    expect(m.palette.length).toBeLessThanOrEqual(10);
    for (const eye of EYES) expect(blueNearEye(m, eye, s)).toBe(0);
  });

  it("with only 4 colors the grays keep their slots (documented trade-off), and the maximum is respected", () => {
    const s = spec("16x20", "portrait", 4);
    const m = convertRaster(neutralSubjectWithBlueEyes(), DEFAULT_CROP, s);
    expect(m.palette.length).toBeLessThanOrEqual(4);
  });
});

describe("the rescue does not disturb other kinds of pictures", () => {
  it("geometric shapes still produce exactly their five flat colors", () => {
    const m = convertRaster(geometricShapes(600, 800), DEFAULT_CROP, spec("12x16", "portrait", 10));
    expect(m.palette.length).toBeGreaterThanOrEqual(5); // white, red, blue, green, black (+ yellow detail)
    expect(m.palette.length).toBeLessThanOrEqual(6);
  });

  it("a gold detail in a dark field is still kept", () => {
    const img = solid(240, 320, BLACK);
    paintRect(img, 11 / 24, 17 / 36, 12 / 24, 18 / 36, GOLD);
    const m = convertRaster(img, DEFAULT_CROP, spec("6x8", "portrait", 4));
    const p = m.palette[m.cells[17][11]];
    expect(Math.hypot(p.r - GOLD[0], p.g - GOLD[1], p.b - GOLD[2])).toBeLessThan(60);
  });

  it("a plain one-color picture stays one color", () => {
    const m = convertRaster(solid(100, 100, [120, 120, 120]), DEFAULT_CROP, spec("8x10", "portrait", 10));
    expect(m.palette.length).toBe(1);
  });
});

function isBluePalette(p: { r: number; g: number; b: number }): boolean {
  return isBlue([p.r, p.g, p.b]);
}
