import fs from "fs";
import { buildGridSpec } from "/home/claude/gridcrow/src/engine/geometry";
import { convertSimplified, SIMPLIFY } from "/home/claude/gridcrow/src/engine/convert/simplify";
import { DEFAULT_CROP } from "/home/claude/gridcrow/src/engine/convert/crop";
import { validateMatrix } from "/home/claude/gridcrow/src/engine/convert/validate";
if (process.env.SIMP_JSON) Object.assign(SIMPLIFY, JSON.parse(process.env.SIMP_JSON));
const dir = "/tmp/claude-0/scratch/hyb/";
const jobs: Array<[string, string, string, number]> = JSON.parse(process.env.JOBS as string);
for (const [file, label, size, max] of jobs) {
  const buf = fs.readFileSync(dir + file + ".rgba");
  const raster = { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
  const spec = buildGridSpec({ sizeId: size as never, orientation: "portrait" as never, maxColors: max as never });
  const m = convertSimplified(raster, DEFAULT_CROP, spec);
  const key = `${label}_${size}_${max}`;
  fs.writeFileSync(dir + key + "_simp.json", JSON.stringify(m));
  let yc = 0; for (const row of m.cells) for (let c = 1; c < row.length; c++) if (row[c] !== row[c-1]) yc++;
  console.log(key, "colors", m.palette.length, "invalid", validateMatrix(m, spec).length, "yarn", yc);
}
