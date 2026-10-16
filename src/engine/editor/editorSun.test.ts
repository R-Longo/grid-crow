import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { convertRaster } from "../convert/convert";
import { DEFAULT_CROP } from "../convert/crop";
import type { Raster, StitchMatrix } from "../convert/types";
import { validateMatrix } from "../convert/validate";
import { buildGridSpec } from "../geometry";
import { colorCounts, countDifferences, paintStitches, stitchesOnSegment } from "./paint";

function loadFixture(name: string): Raster {
  const buf = gunzipSync(readFileSync(new URL(`../convert/fixtures/${name}.rgba.gz`, import.meta.url)));
  return { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
}
const sha = (b: Uint8ClampedArray | string) => createHash("sha1").update(typeof b === "string" ? b : Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest("hex");

describe("editing the converted minimalist sun card (24 x 32 in, 10 colors)", () => {
  const spec = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 10 });
  const raster = loadFixture("sun-card-34");
  const rasterHash = sha(raster.data);
  const converted = convertRaster(raster, DEFAULT_CROP, spec);
  const convertedHash = sha(JSON.stringify(converted));
  const dark = converted.palette
    .map((p, i) => ({ i, l: 0.299 * p.r + 0.587 * p.g + 0.114 * p.b }))
    .sort((a, b) => a.l - b.l)[0].i;

  it("starts valid", () => {
    expect(validateMatrix(converted, spec)).toEqual([]);
  });

  it("repairing a broken ray with a drag changes exactly the stitches on the line, nothing else", () => {
    // A ray from the face outward, drawn as one fast drag (the endpoints are far apart: no gaps allowed).
    const a = { col: 48, row: 60 };
    const b = { col: 74, row: 30 };
    const line = stitchesOnSegment(a, b);
    const { matrix, changed } = paintStitches(converted, line, dark);
    expect(validateMatrix(matrix, spec)).toEqual([]);
    for (const s of line) expect(matrix.cells[s.row][s.col]).toBe(dark);
    expect(countDifferences(converted, matrix)).toBe(changed.length);
    expect(changed.length).toBeLessThanOrEqual(line.length);
    // everything off the line is untouched
    const onLine = new Set(line.map((s) => s.row * spec.cols + s.col));
    for (let r = 0; r < spec.rows; r++) for (let c = 0; c < spec.cols; c++) if (!onLine.has(r * spec.cols + c)) expect(matrix.cells[r][c]).toBe(converted.cells[r][c]);
  });

  it("many edits never add a color, and the converted chart and the source picture are never touched", () => {
    let m: StitchMatrix = converted;
    let seed = 99;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let i = 0; i < 300; i++) {
      const a = { col: rnd(spec.cols), row: rnd(spec.rows) };
      const b = { col: rnd(spec.cols), row: rnd(spec.rows) };
      m = paintStitches(m, stitchesOnSegment(a, b), rnd(converted.palette.length)).matrix;
    }
    expect(validateMatrix(m, spec)).toEqual([]);
    expect(m.palette).toBe(converted.palette);
    expect(m.palette.length).toBeLessThanOrEqual(10);
    expect(colorCounts(m).filter((n) => n > 0).length).toBeLessThanOrEqual(10);
    expect(sha(JSON.stringify(converted))).toBe(convertedHash);
    expect(sha(raster.data)).toBe(rasterHash);
  });
});

describe("architecture", () => {
  const dir = new URL(".", import.meta.url);
  const importsOf = (file: URL) =>
    [...readFileSync(file, "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);

  it("editor modules import nothing that decodes, resamples or converts a picture", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      for (const imp of importsOf(new URL(f, dir))) {
        const ok = imp.startsWith("./") || imp === "../convert/types" || imp === "../geometry";
        expect(ok, `${f} imports ${imp}`).toBe(true);
      }
    }
  });

  it("the converter never imports the editor", () => {
    const conv = new URL("../convert/", import.meta.url);
    for (const f of readdirSync(conv).filter((x) => x.endsWith(".ts"))) {
      for (const imp of importsOf(new URL(f, conv))) expect(imp, `${f} imports ${imp}`).not.toMatch(/editor/);
    }
  });
});
