import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import type { MaxColors } from "../../types";
import { buildGridSpec } from "../geometry";
import { convertRaster } from "./convert";
import { deltaE, rgbToLab } from "./color";
import { DEFAULT_CROP, cropRect, physicalAspect } from "./crop";
import { VOTE } from "./stitchify";
import { LINE_FEATURES, geometricShapes, oliveLineArt } from "./testImages";
import type { Raster, StitchMatrix } from "./types";
import { validateMatrix } from "./validate";

const spec = (size: Parameters<typeof buildGridSpec>[0]["sizeId"], max: MaxColors) =>
  buildGridSpec({ sizeId: size, orientation: "portrait", maxColors: max });

function loadFixture(name: string): Raster {
  const buf = gunzipSync(readFileSync(new URL(`./fixtures/${name}.rgba.gz`, import.meta.url)));
  return { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
}

const lum = (m: StitchMatrix, c: number, r: number) => {
  const p = m.palette[m.cells[r][c]];
  return 0.299 * p.r + 0.587 * p.g + 0.114 * p.b;
};
/** A stitch carries "line" if it is clearly darker than the cream background and olive rather than gray.
 *  (A line narrower than a pixel is drawn lighter than the artist's olive, so allow a washed-out olive.) */
const isOlive = (m: StitchMatrix, c: number, r: number) => {
  const p = m.palette[m.cells[r][c]];
  return lum(m, c, r) < 205 && p.r - p.b > 25 && Math.abs(p.r - p.g) < 15;
};

/** The stitches a polyline passes through (picture coordinates are already the chart's, no crop at 3:4). */
function crossedCells(poly: Array<[number, number]>, cols: number, rows: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i + 1 < poly.length; i++) {
    const [a, b] = [poly[i], poly[i + 1]];
    const steps = 400;
    for (let s = 0; s <= steps; s++) {
      const u = a[0] + ((b[0] - a[0]) * s) / steps;
      const v = a[1] + ((b[1] - a[1]) * s) / steps;
      out.add(Math.min(rows - 1, Math.floor(v * rows)) * cols + Math.min(cols - 1, Math.floor(u * cols)));
    }
  }
  return out;
}

/** Number of 8-connected groups among the given stitches. */
function components(cells: number[], cols: number): number {
  const set = new Set(cells);
  const seen = new Set<number>();
  let n = 0;
  for (const start of cells) {
    if (seen.has(start)) continue;
    n++;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop() as number;
      const r = Math.floor(cur / cols);
      const c = cur % cols;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nb = (r + dr) * cols + c + dc;
          if ((dr || dc) && c + dc >= 0 && c + dc < cols && set.has(nb) && !seen.has(nb)) {
            seen.add(nb);
            stack.push(nb);
          }
        }
    }
  }
  return n;
}

/**
 * How well a line was carried over. A line thinner than a stitch only clips the corner of some of the
 * stitches it crosses, so a crossed stitch may honestly stay background. What matters is that the line
 * has no holes: every point along it has line color in its own stitch or the one beside it, and all the
 * line-colored stitches within a stitch of it form ONE connected piece.
 */
function lineQuality(m: StitchMatrix, poly: Array<[number, number]>) {
  const inkAt = (r: number, c: number) => r >= 0 && c >= 0 && r < m.rows && c < m.cols && isOlive(m, c, r);
  let samples = 0;
  let held = 0;
  const near = new Set<number>();
  for (let i = 0; i + 1 < poly.length; i++) {
    const [a, b] = [poly[i], poly[i + 1]];
    const steps = 600;
    for (let s = 0; s <= steps; s++) {
      const r = Math.floor((a[1] + ((b[1] - a[1]) * s) / steps) * m.rows);
      const c = Math.floor((a[0] + ((b[0] - a[0]) * s) / steps) * m.cols);
      samples++;
      if (inkAt(r, c) || inkAt(r - 1, c) || inkAt(r + 1, c) || inkAt(r, c - 1) || inkAt(r, c + 1)) held++;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) near.add((r + dr) * m.cols + c + dc);
    }
  }
  const ink = [...near].filter((i) => inkAt(Math.floor(i / m.cols), i % m.cols));
  return { recall: held / samples, pieces: components(ink, m.cols) };
}

describe("thin olive linework on cream (celestial-sun regression)", () => {
  const img = oliveLineArt();
  it.each([4, 6, 8, 10] as const)("24x32, %i colors: every line is kept as one connected line", (max) => {
    const s = spec("24x32", max);
    const m = convertRaster(img, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    for (const [name, poly] of Object.entries(LINE_FEATURES)) {
      const q = lineQuality(m, poly);
      expect(q.recall, `${name} recall at ${max} colors`).toBeGreaterThanOrEqual(0.85);
      expect(q.pieces, `${name} pieces at ${max} colors`).toBe(1);
    }
  });

  it("does not turn the lines into fat blobs or scatter stray stitches", () => {
    const m = convertRaster(img, DEFAULT_CROP, spec("24x32", 8));
    const nearLine = new Set<number>();
    for (const poly of Object.values(LINE_FEATURES)) for (const i of crossedCells(poly, m.cols, m.rows)) nearLine.add(i);
    let olive = 0;
    let stray = 0;
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        if (!isOlive(m, c, r)) continue;
        olive++;
        // Allow one stitch of sideways wander next to a line.
        let near = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (nearLine.has((r + dr) * m.cols + c + dc)) near = true;
        if (!near) stray++;
      }
    expect(stray).toBe(0);
    expect(olive).toBeLessThanOrEqual(nearLine.size * 1.6);
  });

  it("is a real regression: with the thin-line rules switched off the lines break up", () => {
    const saved = { ...VOTE };
    VOTE.boost = 0;
    VOTE.inkContrast = 99; // no coverage rule
    VOTE.bridgeCoverage = 99; // no gap closing
    try {
      const m = convertRaster(img, DEFAULT_CROP, spec("24x32", 8));
      const worst = Math.min(...Object.values(LINE_FEATURES).map((p) => lineQuality(m, p).recall));
      expect(worst).toBeLessThan(0.7);
    } finally {
      Object.assign(VOTE, saved);
    }
  });
});

/** Ink = clearly different from the most common (background) color. Recall is weighted by how much of
 *  each stitch the ink fills in the source. */
function inkStats(raster: Raster, m: StitchMatrix, s: ReturnType<typeof spec>) {
  const rect = cropRect(raster.width, raster.height, physicalAspect(s.widthInches, s.heightInches), DEFAULT_CROP);
  // Background = most common palette color's nearest source pixel is awkward; use the chart's own most common color.
  const bgLab = new Float32Array(3);
  rgbToLab(m.palette[0].r, m.palette[0].g, m.palette[0].b, bgLab, 0);
  const tmp = new Float32Array(3);
  const far = (r: number, g: number, b: number) => {
    rgbToLab(r, g, b, tmp, 0);
    return deltaE(tmp, 0, bgLab, 0) > 18;
  };
  let weighted = 0;
  let total = 0;
  let inkStitches = 0;
  for (let r = 0; r < m.rows; r++)
    for (let c = 0; c < m.cols; c++) {
      let n = 0;
      let cnt = 0;
      const x0 = Math.floor(rect.x + (c / m.cols) * rect.w);
      const x1 = Math.max(x0 + 1, Math.floor(rect.x + ((c + 1) / m.cols) * rect.w));
      const y0 = Math.floor(rect.y + (r / m.rows) * rect.h);
      const y1 = Math.max(y0 + 1, Math.floor(rect.y + ((r + 1) / m.rows) * rect.h));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const p = (y * raster.width + x) * 4;
          cnt++;
          if (far(raster.data[p], raster.data[p + 1], raster.data[p + 2])) n++;
        }
      const cov = n / cnt;
      total += cov;
      const p = m.palette[m.cells[r][c]];
      if (far(p.r, p.g, p.b)) {
        weighted += cov;
        inkStitches++;
      }
    }
  return { recall: weighted / total, areaRatio: inkStitches / total };
}

describe("real artwork (user-supplied)", () => {
  const sun = loadFixture("sun");
  const tarot = loadFixture("tarot");

  it("minimalist sun, 24x32 at 6/8/10 colors: far more of the linework survives, without bloating", () => {
    for (const max of [6, 8, 10] as const) {
      const s = spec("24x32", max);
      const m = convertRaster(sun, DEFAULT_CROP, s);
      expect(validateMatrix(m, s)).toEqual([]);
      expect(m.palette.length).toBeLessThanOrEqual(max);
      const q = inkStats(sun, m, s);
      expect(q.recall, `recall at ${max}`).toBeGreaterThanOrEqual(0.5); // was 0.38 (6 colors) and 0.30 (10)
      expect(q.areaRatio, `area at ${max}`).toBeGreaterThan(0.75);
      expect(q.areaRatio, `area at ${max}`).toBeLessThan(1.35);
    }
  });

  it("minimalist sun keeps the face: both brows, both closed eyes and the mouth are olive", () => {
    const m = convertRaster(sun, DEFAULT_CROP, spec("24x32", 8));
    // Face band of the source card (about 40–47% down), left and right of the centre line.
    let left = 0;
    let right = 0;
    for (let r = Math.floor(0.4 * m.rows); r < Math.floor(0.5 * m.rows); r++)
      for (let c = Math.floor(0.3 * m.cols); c < Math.floor(0.7 * m.cols); c++) {
        if (!isOliveDark(m, c, r)) continue;
        if (c < m.cols / 2) left++;
        else right++;
      }
    expect(left).toBeGreaterThanOrEqual(8);
    expect(right).toBeGreaterThanOrEqual(8);
    expect(Math.abs(left - right) / Math.max(left, right)).toBeLessThan(0.4);
  });

  // Before this work the same chart had recall 0.73–0.74, 4.6–6.3% lone stitches and 2496 / 2491 / 3022
  // color changes (crochet yarn changes). Recall must not drop; noise and yarn changes must not rise.
  it.each([
    ["16x20", 8, 2520],
    ["16x20", 10, 2520],
    ["18x24", 10, 3050],
  ] as const)("Sun tarot card, %s with %i colors: artwork kept, fewer stray stitches, no extra yarn changes", (size, max, maxChanges) => {
    const s = spec(size, max);
    const m = convertRaster(tarot, DEFAULT_CROP, s);
    expect(validateMatrix(m, s)).toEqual([]);
    expect(m.palette.length).toBeLessThanOrEqual(max);
    const q = inkStats(tarot, m, s);
    expect(q.recall).toBeGreaterThanOrEqual(0.7);
    expect(q.areaRatio).toBeGreaterThan(0.85);
    expect(q.areaRatio).toBeLessThan(1.2);
    let lone = 0;
    let changes = 0;
    for (let r = 0; r < m.rows; r++)
      for (let c = 0; c < m.cols; c++) {
        const v = m.cells[r][c];
        if (c > 0 && m.cells[r][c - 1] !== v) changes++;
        if (r > 0 && r < m.rows - 1 && c > 0 && c < m.cols - 1 && m.cells[r - 1][c] !== v && m.cells[r + 1][c] !== v && m.cells[r][c - 1] !== v && m.cells[r][c + 1] !== v) lone++;
      }
    expect(lone / (m.cols * m.rows)).toBeLessThan(0.045);
    expect(changes).toBeLessThanOrEqual(maxChanges);
  });

  it("is deterministic on real artwork", () => {
    const s = spec("16x20", 8);
    expect(convertRaster(tarot, DEFAULT_CROP, s)).toEqual(convertRaster(tarot, DEFAULT_CROP, s));
  });
});

const isOliveDark = (m: StitchMatrix, c: number, r: number) => lum(m, c, r) < 160 && isOlive(m, c, r);

describe("geometric illustrations are not affected", () => {
  it("shapes keep exact solid colors at every color limit", () => {
    for (const max of [4, 6, 8, 10] as const) {
      const s = spec("12x16", max);
      const m = convertRaster(geometricShapes(), DEFAULT_CROP, s);
      expect(validateMatrix(m, s)).toEqual([]);
      const hexes = m.palette.map((p) => p.hex);
      expect(hexes).toHaveLength(Math.min(max, 5)); // white, red, blue, green, black: nothing invented
      expect(new Set(hexes).size).toBe(hexes.length);
    }
  });
});

afterEach(() => {
  /* VOTE.boost is restored inside the test that changes it */
});
