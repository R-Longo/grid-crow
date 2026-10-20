import { describe, expect, it } from "vitest";
import type { Raster } from "../convert/types";
import { strengthenThinLines } from "./strengthen";

function paper(w: number, h: number): Raster {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  return { width: w, height: h, data };
}
function set(r: Raster, x: number, y: number, v: number) {
  const i = (y * r.width + x) * 4;
  r.data[i] = r.data[i + 1] = r.data[i + 2] = v;
}
const dark = (r: Raster, x: number, y: number) => r.data[(y * r.width + x) * 4] < 128;
// 24 stitches across a 192 px picture: 8 px per stitch, so the working size equals the picture.
const OPTS = { cols: 24, aspect: 1 };

describe("strengthenThinLines", () => {
  it("widens a 1-pixel line to roughly a stitch without moving it", () => {
    const r = paper(192, 192);
    for (let y = 20; y < 170; y++) set(r, 96, y, 0);
    const out = strengthenThinLines(r, OPTS).raster;
    let width = 0;
    for (let x = 0; x < 192; x++) if (dark(out, x, 90)) width++;
    expect(width).toBeGreaterThanOrEqual(5);
    expect(width).toBeLessThanOrEqual(9);
    expect(dark(out, 96, 90)).toBe(true);
    expect(dark(out, 60, 90)).toBe(false);
  });

  it("leaves broad dark shapes and plain paper alone", () => {
    const r = paper(192, 192);
    for (let y = 40; y < 120; y++) for (let x = 40; x < 120; x++) set(r, x, y, 20);
    const out = strengthenThinLines(r, OPTS);
    expect(Array.from(out.raster.data)).toEqual(Array.from(r.data));
    expect(out.stats.strokes).toBe(0);
    const blank = strengthenThinLines(paper(192, 192), OPTS);
    expect(Array.from(blank.raster.data)).toEqual(Array.from(paper(192, 192).data));
  });

  it("does not fuse two close lines into one", () => {
    const r = paper(192, 192);
    for (let y = 20; y < 170; y++) { set(r, 90, y, 0); set(r, 98, y, 0); }
    const out = strengthenThinLines(r, OPTS).raster;
    expect(dark(out, 90, 90)).toBe(true);
    expect(dark(out, 98, 90)).toBe(true);
    expect(dark(out, 94, 90)).toBe(false); // the gap between them stays paper
  });

  it("drops specks much smaller than a stitch", () => {
    const r = paper(192, 192);
    set(r, 50, 50, 0);
    set(r, 51, 50, 0);
    const out = strengthenThinLines(r, OPTS).raster;
    expect(dark(out, 50, 50)).toBe(true); // the speck itself is not touched, only not widened
    expect(dark(out, 54, 50)).toBe(false);
  });

  it("is deterministic and keeps the picture's proportions", () => {
    const r = paper(400, 300);
    for (let x = 10; x < 390; x++) set(r, x, 150, 0);
    const a = strengthenThinLines(r, { cols: 20, aspect: 4 / 3 });
    const b = strengthenThinLines(r, { cols: 20, aspect: 4 / 3 });
    expect(Array.from(a.raster.data)).toEqual(Array.from(b.raster.data));
    expect(Math.abs(a.raster.width / a.raster.height - 400 / 300)).toBeLessThan(0.02);
  });

  it("does not change the picture it is given", () => {
    const r = paper(192, 192);
    for (let y = 20; y < 170; y++) set(r, 96, y, 0);
    const copy = Array.from(r.data);
    strengthenThinLines(r, OPTS);
    expect(Array.from(r.data)).toEqual(copy);
  });
});

import { assessPicture } from "./strengthen";

describe("assessPicture", () => {
  it("calls a drawing on light paper line art", () => {
    const r = paper(200, 200);
    for (let y = 20; y < 180; y++) set(r, 100, y, 0);
    expect(assessPicture(r).lineArt).toBe(true);
  });
  it("does not call a dark picture, a mid-tone fill or a busy painting line art", () => {
    const dark = paper(200, 200); dark.data.fill(10); for (let i = 3; i < dark.data.length; i += 4) dark.data[i] = 255;
    expect(assessPicture(dark).lineArt).toBe(false);
    const grey = paper(200, 200); for (let i = 0; i < grey.data.length; i += 4) grey.data[i] = grey.data[i + 1] = grey.data[i + 2] = 150;
    expect(assessPicture(grey).lineArt).toBe(false);
    const busy = paper(200, 200);
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { const i = (y * 200 + x) * 4; busy.data[i] = (x * 37) % 256; busy.data[i + 1] = (y * 53) % 256; busy.data[i + 2] = ((x + y) * 11) % 256; }
    expect(assessPicture(busy).lineArt).toBe(false);
  });
});
