import fs from "fs";
import { buildGridSpec } from "/home/claude/gridcrow/src/engine/geometry";
import { convertRaster } from "/home/claude/gridcrow/src/engine/convert/convert";
import { convertHybridDetailed } from "/home/claude/gridcrow/src/engine/convert/hybrid";
import { DEFAULT_CROP, cropRect, physicalAspect } from "/home/claude/gridcrow/src/engine/convert/crop";
import { flattenOnWhite, resampleArea } from "/home/claude/gridcrow/src/engine/convert/resample";
import { rgbToLab } from "/home/claude/gridcrow/src/engine/convert/color";
import { validateMatrix } from "/home/claude/gridcrow/src/engine/convert/validate";
const dir = "/tmp/claude-0/scratch/hyb/";
// [file, label, size, orientation, maxColors]
const jobs: Array<[string, string, string, string, number]> = JSON.parse(process.env.JOBS as string);
const res: any[] = [];
for (const [file, label, size, orient, max] of jobs) {
  const buf = fs.readFileSync(dir + file + ".rgba");
  const raster = { width: buf.readUInt32LE(0), height: buf.readUInt32LE(4), data: new Uint8ClampedArray(buf.subarray(8)) };
  const spec = buildGridSpec({ sizeId: size as never, orientation: orient as never, maxColors: max as never });
  const photo = convertRaster(raster, DEFAULT_CROP, spec);
  const h = convertHybridDetailed(raster, DEFAULT_CROP, spec, (process.env.WEIGHT as any) || "bold");
  const bad = validateMatrix(h.matrix, spec).length;
  // source ink mask at stitch level
  const B = 6, W = spec.cols * B, H = spec.rows * B;
  const rect = cropRect(raster.width, raster.height, physicalAspect(spec.widthInches, spec.heightInches), DEFAULT_CROP);
  const rgb = resampleArea(flattenOnWhite(raster), rect, W, H);
  const lab = new Float32Array(W * H * 3); for (let i = 0; i < W * H; i++) rgbToLab(rgb[i*3], rgb[i*3+1], rgb[i*3+2], lab, i*3);
  const keyc = new Map<string, number>(); for (let i = 0; i < W*H; i++) { const k = `${Math.round(lab[i*3]/4)},${Math.round(lab[i*3+1]/4)},${Math.round(lab[i*3+2]/4)}`; keyc.set(k, (keyc.get(k)||0)+1); }
  let bk = "", bn = 0; for (const [k,n] of keyc) if (n > bn) { bn = n; bk = k; }
  const [bl, ba, bb] = bk.split(",").map((x) => +x * 4);
  const srcInk = new Float32Array(spec.cols * spec.rows);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y*W+x)*3; if (Math.hypot(lab[i]-bl, lab[i+1]-ba, lab[i+2]-bb) > 25) srcInk[((y/B)|0)*spec.cols + ((x/B)|0)] += 1/(B*B); }
  // output field color = palette nearest the source background
  const nearField = (m: any) => { let bi = 0, bd = 1e9; m.palette.forEach((p: any, i: number) => { const t = new Float32Array(3); rgbToLab(p.r, p.g, p.b, t, 0); const d = Math.hypot(t[0]-bl, t[1]-ba, t[2]-bb); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const stats = (m: any) => {
    const f = nearField(m); let rec = 0, srcN = 0, spur = 0, outInk = 0, lone = 0;
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      const s = r*m.cols+c; const isI = m.cells[r][c] !== f; if (isI) outInk++;
      if (srcInk[s] >= 0.15) { srcN++; if (isI) rec++; }
      if (isI && srcInk[s] < 0.03) spur++;
      if (isI) { let n = 0; for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) if ((dr||dc) && r+dr>=0&&c+dc>=0&&r+dr<m.rows&&c+dc<m.cols && m.cells[r+dr][c+dc] !== f) n++; if (!n) lone++; }
    }
    let yc = 0; for (const row of m.cells) for (let c = 1; c < row.length; c++) if (row[c] !== row[c-1]) yc++;
    return { recall: +(rec/Math.max(1,srcN)).toFixed(3), spurious: spur, lone, yarn: yc, ink: outInk };
  };
  let diff = 0; for (let r = 0; r < spec.rows; r++) for (let c = 0; c < spec.cols; c++) if (photo.cells[r][c] !== h.matrix.cells[r][c]) diff++;
  const key = `${label}_${size}_${max}`;
  fs.writeFileSync(dir + key + "_photo.json", JSON.stringify(photo)); fs.writeFileSync(dir + key + "_hyb.json", JSON.stringify(h.matrix));
  res.push({ key, applied: h.applied, reason: h.reason, bgShare: +h.bgShare.toFixed(2), thin: +h.thin.toFixed(2), changed: diff, pct: +(100*diff/(spec.cols*spec.rows)).toFixed(2), invalid: bad, photo: stats(photo), hyb: stats(h.matrix) });
}
fs.writeFileSync(dir + "hyb_results.json", JSON.stringify(res, null, 1));
for (const r of res) console.log(`${r.key.padEnd(34)} ${r.applied ? "ON " : "off"} changed ${String(r.changed).padStart(4)} (${r.pct}%)  recall ${r.photo.recall}->${r.hyb.recall}  lone ${r.photo.lone}->${r.hyb.lone}  spur ${r.photo.spurious}->${r.hyb.spurious}  yarn ${r.photo.yarn}->${r.hyb.yarn}  bg ${r.bgShare} thin ${r.thin}  inv ${r.invalid}  ${r.applied ? "" : r.reason}`);
