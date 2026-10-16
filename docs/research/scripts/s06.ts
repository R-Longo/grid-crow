import fs from "fs";
import { buildGridSpec } from "/home/claude/gridcrow/src/engine/geometry";
import { convertRaster } from "/home/claude/gridcrow/src/engine/convert/convert";
import { CLEANUP_DEFAULTS } from "/home/claude/gridcrow/src/engine/convert/cleanup";
import { DEFAULT_CROP } from "/home/claude/gridcrow/src/engine/convert/crop";
const dir = "/tmp/claude-0/scratch/hyb/";
const buf = fs.readFileSync(dir + "s06-tarot-color.rgba");
const raster = { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
for (const [size, max] of [["16x20", 8], ["24x32", 10]] as const) {
  const spec = buildGridSpec({ sizeId: size as never, orientation: "portrait" as never, maxColors: max as never });
  const saved = { ...CLEANUP_DEFAULTS };
  Object.assign(CLEANUP_DEFAULTS, { maxSmallRegion: 5, protectContrast1: 60, protectContrast2: 50, passes: 4 });
  const m = convertRaster(raster, DEFAULT_CROP, spec);
  Object.assign(CLEANUP_DEFAULTS, saved);
  fs.writeFileSync(`${dir}s06_${size}_${max}_simp.json`, JSON.stringify(m));
  let yc = 0; for (const row of m.cells) for (let c = 1; c < row.length; c++) if (row[c] !== row[c-1]) yc++;
  console.log(size, max, "yarn", yc);
}
