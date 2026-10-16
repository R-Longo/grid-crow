import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { MaxColors } from "../../types";
import { buildGridSpec } from "../geometry";
import { convertRaster } from "./convert";
import { DEFAULT_CROP, cropRect, physicalAspect } from "./crop";
import { RESCUE } from "./quantize";
import type { Raster, StitchMatrix } from "./types";
import { validateMatrix } from "./validate";

// A real photograph of a gray-and-white kitten with blue eyes (user-supplied, 319 × 421).
// Before the color-rescue fix, its blue eyes came out dark gray at 8 and 10 colors.
function loadKitten(): Raster {
  const buf = gunzipSync(readFileSync(new URL("./fixtures/kitten.rgba.gz", import.meta.url)));
  const width = buf.readUInt32LE(0);
  const height = buf.readUInt32LE(4);
  return { width, height, data: new Uint8ClampedArray(buf.subarray(8)) };
}

const EYES_IN_PICTURE: Array<[number, number]> = [
  [128 / 319, 189 / 421],
  [206 / 319, 192 / 421],
];

const isBlue = (p: { r: number; g: number; b: number }) => p.b - p.r >= 20 && p.b >= p.g;

function blueNearEye(m: StitchMatrix, raster: Raster, eye: [number, number], aspect: number, reach = 0.06): number {
  const r0 = cropRect(raster.width, raster.height, aspect, DEFAULT_CROP);
  const ex = (eye[0] * raster.width - r0.x) / r0.w;
  const ey = (eye[1] * raster.height - r0.y) / r0.h;
  let n = 0;
  for (let r = 0; r < m.rows; r++) {
    for (let c = 0; c < m.cols; c++) {
      if (Math.abs((c + 0.5) / m.cols - ex) > reach || Math.abs((r + 0.5) / m.rows - ey) > reach) continue;
      if (isBlue(m.palette[m.cells[r][c]])) n++;
    }
  }
  return n;
}

describe("kitten photograph: blue eyes are kept", () => {
  const kitten = loadKitten();

  it.each([6, 8, 10] as const)("16 × 20 in portrait with %i colors has blue stitches in both eyes", (max: MaxColors) => {
    const s = buildGridSpec({ sizeId: "16x20", orientation: "portrait", maxColors: max });
    const m = convertRaster(kitten, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    const aspect = physicalAspect(s.widthInches, s.heightInches);
    for (const eye of EYES_IN_PICTURE) expect(blueNearEye(m, kitten, eye, aspect)).toBeGreaterThanOrEqual(3);
  });

  it("blue stitches stay inside the eyes (no scattered blue)", () => {
    const s = buildGridSpec({ sizeId: "16x20", orientation: "portrait", maxColors: 8 });
    const m = convertRaster(kitten, DEFAULT_CROP, s);
    const aspect = physicalAspect(s.widthInches, s.heightInches);
    const total = m.cells.flat().filter((v) => isBlue(m.palette[v])).length;
    const inEyes = EYES_IN_PICTURE.reduce((n, e) => n + blueNearEye(m, kitten, e, aspect), 0);
    expect(total).toBeLessThanOrEqual(inEyes + 4); // allow a little blue-gray background edge
  });

  it("is deterministic", () => {
    const s = buildGridSpec({ sizeId: "16x20", orientation: "portrait", maxColors: 10 });
    expect(convertRaster(kitten, DEFAULT_CROP, s)).toEqual(convertRaster(kitten, DEFAULT_CROP, s));
  });

  it("without the rescue step the blue is lost (proves the test detects the original bug)", () => {
    const original = RESCUE.maxRescues;
    RESCUE.maxRescues = () => 0;
    try {
      const s = buildGridSpec({ sizeId: "16x20", orientation: "portrait", maxColors: 8 });
      const m = convertRaster(kitten, DEFAULT_CROP, s);
      const aspect = physicalAspect(s.widthInches, s.heightInches);
      const found = EYES_IN_PICTURE.map((e) => blueNearEye(m, kitten, e, aspect));
      expect(Math.min(...found)).toBeLessThan(3);
    } finally {
      RESCUE.maxRescues = original;
    }
  });
});
