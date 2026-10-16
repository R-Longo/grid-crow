// Prints where the PNG exporter puts things, for a chart of the given size and number of colors in use.
// Used by stage5_browser.py to read the real downloaded PNG. Run: npx vite-node scripts/e2e/layout_probe.ts 96 144 8
import { buildPatternModel } from "../../src/engine/export/pattern";
import { layoutPng } from "../../src/engine/export/png";

const [cols, rows, n] = process.argv.slice(2).map(Number);
const pal = Array.from({ length: n }, (_, i) => ({ r: i, g: i, b: i, hex: "#" + (i * 16).toString(16).padStart(2, "0").repeat(3) }));
const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (r * cols + c) % n));
const l = layoutPng(buildPatternModel({ cols, rows, palette: pal, cells }));
console.log(JSON.stringify({ width: l.width, height: l.height, cellW: l.cellW, cellH: l.cellH, x0: l.x0, y0: l.y0, chartW: l.chartW, chartH: l.chartH, legend: l.legend.map((e) => ({ swatch: e.swatch, hexText: e.hexText, countText: e.countText })), total: l.total, legendTitle: l.legendTitle }));
