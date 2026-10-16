import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { MaxColors } from "../../types";
import { buildGridSpec } from "../geometry";
import { DEFAULT_CROP } from "../convert/crop";
import { ILLUSTRATION, convertIllustration } from "./illustration";
import { BLACK, BLUE, GOLD, GREEN, LINE_FEATURES, RED, WHITE, geometricShapes, oliveLineArt, shapeColorAt } from "../convert/testImages";
import type { RGB } from "../convert/testImages";
import type { Raster, StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";

const spec = (size: Parameters<typeof buildGridSpec>[0]["sizeId"], max: MaxColors) =>
  buildGridSpec({ sizeId: size, orientation: "portrait", maxColors: max });

function load(name: string): Raster {
  const buf = gunzipSync(readFileSync(new URL(`../convert/fixtures/${name}.rgba.gz`, import.meta.url)));
  return { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
}

/** Anything that is not the most common color (the background, index 0) is ink. */
const inkAt = (m: StitchMatrix, r: number, c: number) => r >= 0 && c >= 0 && r < m.rows && c < m.cols && m.cells[r][c] !== 0;

function pieces(m: StitchMatrix, within?: Set<number>): number[] {
  const seen = new Set<number>();
  const sizes: number[] = [];
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      const s = r * m.cols + c;
      if (!inkAt(m, r, c) || seen.has(s) || (within && !within.has(s))) continue;
      let n = 0;
      const stack = [s];
      seen.add(s);
      while (stack.length) {
        const cur = stack.pop() as number;
        n++;
        const cr = Math.floor(cur / m.cols);
        const cc = cur % m.cols;
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = cr + dr;
            const c2 = cc + dc;
            const nb = rr * m.cols + c2;
            if ((dr || dc) && inkAt(m, rr, c2) && !seen.has(nb) && (!within || within.has(nb))) {
              seen.add(nb);
              stack.push(nb);
            }
          }
      }
      sizes.push(n);
    }
  return sizes.sort((a, b) => b - a);
}

describe("illustration conversion: thin lines", () => {
  const img = oliveLineArt();
  it.each([4, 6, 8, 10] as const)("24x32, %i colors: every line is one connected line, no holes", (max) => {
    const s = spec("24x32", max);
    const m = convertIllustration(img, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    expect(m.palette.length).toBeLessThanOrEqual(max);
    for (const [name, poly] of Object.entries(LINE_FEATURES)) {
      const near = new Set<number>();
      let held = 0;
      let samples = 0;
      for (let i = 0; i + 1 < poly.length; i++) {
        for (let t = 0; t <= 600; t++) {
          const r = Math.floor((poly[i][1] + ((poly[i + 1][1] - poly[i][1]) * t) / 600) * m.rows);
          const c = Math.floor((poly[i][0] + ((poly[i + 1][0] - poly[i][0]) * t) / 600) * m.cols);
          samples++;
          if (inkAt(m, r, c) || inkAt(m, r - 1, c) || inkAt(m, r + 1, c) || inkAt(m, r, c - 1) || inkAt(m, r, c + 1)) held++;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) near.add((r + dr) * m.cols + c + dc);
        }
      }
      expect(held / samples, `${name} holes`).toBeGreaterThanOrEqual(0.95);
      expect(pieces(m, near).length, `${name} pieces`).toBe(1);
    }
  });

  it("line weight: bolder draws at least as many stitches, and each is still one color per stitch", () => {
    const count = (w: "fine" | "medium" | "bold") =>
      convertIllustration(img, DEFAULT_CROP, spec("24x32", 6), w).cells.flat().filter((v) => v !== 0).length;
    expect(count("fine")).toBeLessThanOrEqual(count("medium"));
    expect(count("medium")).toBeLessThanOrEqual(count("bold"));
  });

  it("is deterministic", () => {
    const s = spec("24x32", 8);
    expect(convertIllustration(img, DEFAULT_CROP, s)).toEqual(convertIllustration(img, DEFAULT_CROP, s));
  });
});

describe("illustration conversion: flat-color shapes stay exact", () => {
  const known: RGB[] = [WHITE, RED, BLUE, GREEN, BLACK, GOLD];
  it.each([4, 6, 8, 10] as const)("%i colors: no invented colors, solid shape interiors", (max) => {
    const s = spec("12x16", max);
    const m = convertIllustration(geometricShapes(), DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    for (const p of m.palette) {
      const near = Math.min(...known.map((k) => Math.hypot(p.r - k[0], p.g - k[1], p.b - k[2])));
      expect(near, `${p.hex} should be one of the picture's own colors`).toBeLessThan(14);
    }
    // Cell centres well inside a shape carry that shape's color.
    let wrong = 0;
    let checked = 0;
    for (let r = 2; r < m.rows - 2; r++)
      for (let c = 2; c < m.cols - 2; c++) {
        const u = (c + 0.5) / m.cols;
        const v = (r + 0.5) / m.rows;
        const here = shapeColorAt(u, v);
        const uniform = [[-0.04, 0], [0.04, 0], [0, -0.03], [0, 0.03]].every(([du, dv]) => shapeColorAt(u + du, v + dv).join() === here.join());
        if (!uniform) continue;
        checked++;
        const p = m.palette[m.cells[r][c]];
        if (Math.hypot(p.r - here[0], p.g - here[1], p.b - here[2]) > 14) wrong++;
      }
    expect(checked).toBeGreaterThan(100);
    // The yellow square is a single stitch group; allow it to be absent at 4 colors.
    expect(wrong / checked).toBeLessThan(max === 4 ? 0.15 : 0.02);
  });
});

describe("illustration conversion: the sun card (real artwork)", () => {
  const card34 = load("sun-card-34");
  const card45 = load("sun-card-45");

  it("24x32 at 10 colors: uses only the artist's cream and olive", () => {
    const s = spec("24x32", 10);
    const m = convertIllustration(card34, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    expect(m.palette).toHaveLength(2);
    expect(m.palette[0].r).toBeGreaterThan(240); // cream background
    const ink = m.palette[1];
    expect(Math.abs(ink.r - 118)).toBeLessThan(15); // the real olive, not a blend
    expect(Math.abs(ink.g - 117)).toBeLessThan(15);
    expect(Math.abs(ink.b - 34)).toBeLessThan(20);
  });

  it("24x32: both side borders are continuous lines", () => {
    const m = convertIllustration(card34, DEFAULT_CROP, spec("24x32", 10));
    for (const [from, to] of [[8, 24], [m.cols - 24, m.cols - 8]]) {
      let best = 0;
      for (let c = from; c < to; c++) {
        let n = 0;
        for (let r = 20; r < 124; r++) if (inkAt(m, r, c)) n++;
        best = Math.max(best, n / 104);
      }
      expect(best).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("24x32: the rays stay connected, the lettering and the face are present", () => {
    const m = convertIllustration(card34, DEFAULT_CROP, spec("24x32", 10));
    const sizes = pieces(m);
    expect(sizes.filter((n) => n >= 8).length).toBeGreaterThanOrEqual(12); // border pieces, rays, suns, lettering
    // Lettering ("SUN") in the lower middle.
    let text = 0;
    for (let r = 125; r < 140; r++) for (let c = 38; c < 58; c++) if (inkAt(m, r, c)) text++;
    expect(text).toBeGreaterThanOrEqual(35);
    // Face band: brows, closed eyes and mouth give ink on both sides of the centre line.
    let left = 0;
    let right = 0;
    for (let r = 55; r < 80; r++)
      for (let c = 36; c < 61; c++)
        if (inkAt(m, r, c)) {
          if (c < m.cols / 2) left++;
          else right++;
        }
    expect(left).toBeGreaterThanOrEqual(12);
    expect(right).toBeGreaterThanOrEqual(12);
    expect(Math.abs(left - right) / Math.max(left, right)).toBeLessThan(0.45);
  });

  it("16x20 at 6 colors: still cream and olive only, rays and border present", () => {
    const s = spec("16x20", 6);
    const m = convertIllustration(card45, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    expect(m.palette).toHaveLength(2);
    const sizes = pieces(m);
    expect(sizes[0]).toBeGreaterThanOrEqual(100); // the border
    expect(sizes.filter((n) => n >= 6).length).toBeGreaterThanOrEqual(6);
  });

  it("uses the working resolution and thresholds it documents", () => {
    expect(ILLUSTRATION.block).toBe(8);
    expect(ILLUSTRATION.ridge.fine).toBeGreaterThan(ILLUSTRATION.ridge.medium);
    expect(ILLUSTRATION.ridge.medium).toBeGreaterThan(ILLUSTRATION.ridge.bold);
  });
});
