// Prints where the PDF exporter puts the chart on each page, for a chart of the given size and number of colors in use.
// Used by stage5b_browser.py to read the real downloaded PDF. Run: npx vite-node scripts/e2e/pdf_probe.ts 96 144 10 fit|tiled
import { buildPatternModel } from "../../src/engine/export/pattern";
import { buildPdfDoc } from "../../src/engine/export/pdf";

const [a, b, c, layout] = process.argv.slice(2);
const cols = Number(a), rows = Number(b), n = Number(c);
const pal = Array.from({ length: n }, (_, i) => ({ r: i, g: i, b: i, hex: "#" + (i * 16).toString(16).padStart(2, "0").repeat(3) }));
const cells = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, k) => (r * cols + k) % n));
const doc = buildPdfDoc(buildPatternModel({ cols, rows, palette: pal, cells }), { layout: layout as "fit" | "tiled", letters: true });
console.log(JSON.stringify(doc.pages.map((p) => ({ width: p.width, height: p.height, kind: p.meta?.kind, chart: p.meta?.chart, tile: p.meta?.tile }))));
