import fs from "fs";
import { buildGridSpec } from "/home/claude/gridcrow/src/engine/geometry";
import { convertRaster } from "/home/claude/gridcrow/src/engine/convert/convert";
import { convertIllustration } from "/home/claude/gridcrow/src/engine/convert/illustration";
import { DEFAULT_CROP } from "/home/claude/gridcrow/src/engine/convert/crop";
import { validateMatrix } from "/home/claude/gridcrow/src/engine/convert/validate";
const dir = "/tmp/claude-0/scratch/samples/";
const meta: Array<[string, [number, number]]> = JSON.parse(fs.readFileSync(dir + "meta.json", "utf8"));
const runs = [["24x32", 10], ["16x20", 8]] as const;
const out: any[] = [];
for (const [tag, [w, h]] of meta) {
  const buf = fs.readFileSync(dir + tag + ".rgba");
  const raster = { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
  const orientation = w / h > 1.1 ? "landscape" : "portrait";
  for (const [size, max] of runs) {
    const spec = buildGridSpec({ sizeId: size as never, orientation: orientation as never, maxColors: max as never });
    const t0 = Date.now(); const cur = convertRaster(raster, DEFAULT_CROP, spec); const t1 = Date.now();
    const ill = convertIllustration(raster, DEFAULT_CROP, spec); const t2 = Date.now();
    const bad = validateMatrix(ill, spec).length + validateMatrix(cur, spec).length;
    const changes = (m: any) => { let n = 0; for (const row of m.cells) for (let c = 1; c < row.length; c++) if (row[c] !== row[c-1]) n++; return n; };
    fs.writeFileSync(`${dir}${tag}_${size}_cur.json`, JSON.stringify(cur)); fs.writeFileSync(`${dir}${tag}_${size}_ill.json`, JSON.stringify(ill));
    out.push({ tag, size, max, cols: spec.cols, rows: spec.rows, curColors: cur.palette.length, illColors: ill.palette.length, curChanges: changes(cur), illChanges: changes(ill), curMs: t1 - t0, illMs: t2 - t1, invalid: bad });
  }
}
fs.writeFileSync(dir + "results.json", JSON.stringify(out, null, 1));
for (const r of out) console.log(`${r.tag.padEnd(22)} ${r.size} k${r.max}  colors cur ${r.curColors} ill ${r.illColors} | yarn changes cur ${r.curChanges} ill ${r.illChanges} | ms ${r.curMs}/${r.illMs} | invalid ${r.invalid}`);
