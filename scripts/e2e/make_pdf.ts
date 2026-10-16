// Writes a sample PDF from a synthetic chart, for checking with pdftoppm / pdftotext / qpdf.
// Run: npx vite-node scripts/e2e/make_pdf.ts COLS ROWS COLORS fit|tiled letters|noletters OUT.pdf
import { writeFileSync } from "node:fs";
import { buildPatternModel } from "../../src/engine/export/pattern";
import { buildPdf } from "../../src/engine/export/pdf";

const [a, b, c, layout, letters, out] = process.argv.slice(2);
const cols = Number(a), rows = Number(b), n = Number(c);
const hexes = ["#FDFDFB", "#8E8D51", "#EDEDE4", "#9A9967", "#7C7A32", "#1F2A44", "#B5523B", "#D9A441", "#3E6B5A", "#5B5048"];
const pal = Array.from({ length: n }, (_, i) => {
  const hex = hexes[i % hexes.length];
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, hex };
});
// a circle on diagonal bands, so orientation mistakes are obvious (the circle sits low and to the right)
const cells = Array.from({ length: rows }, (_, r) =>
  Array.from({ length: cols }, (_, k) => {
    const dx = k - cols * 0.65, dy = r - rows * 0.7;
    if (dx * dx + dy * dy < (Math.min(cols, rows) * 0.18) ** 2) return n - 1;
    return Math.floor(((k + r) / 7)) % (n - 1);
  }),
);
const pdf = buildPdf(buildPatternModel({ cols, rows, palette: pal, cells }), { layout: layout as "fit" | "tiled", letters: letters === "letters" });
writeFileSync(out, pdf);
console.log(out, pdf.length, "bytes");
