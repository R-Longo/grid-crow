import { textWidth } from "./metrics";
import type { Op, PdfDoc } from "./ops";

/**
 * A small PDF 1.4 writer. It draws filled rectangles, straight lines and text in the two built-in Helvetica fonts, and
 * nothing else: no images (so every stitch stays crisp at any zoom or print size), no compression, no dates. The same
 * chart always gives the same bytes. The whole file is plain ASCII.
 */

const num = (n: number): string => {
  const s = (Math.round(n * 1000) / 1000).toString();
  return s === "-0" ? "0" : s;
};

/** "#RRGGBB" -> "r g b" with each part 0..1. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => num(v / 255)).join(" ");
}

/** A PDF string literal in WinAnsi, kept to ASCII by writing anything unusual as an octal escape. */
export function pdfString(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else {
      const win = ch === "–" ? 0x96 : ch === "—" ? 0x97 : c >= 0xa0 && c <= 0xff ? c : 0x3f;
      out += "\\" + win.toString(8).padStart(3, "0");
    }
  }
  return `(${out})`;
}

function content(ops: Op[], pageH: number): string {
  const out: string[] = [];
  let fill = "";
  let stroke = "";
  let width = "";
  out.push("0 J 0 j"); // square line ends, mitred joins
  for (const op of ops) {
    if (op.k === "rect") {
      if (op.fill !== fill) {
        out.push(`${rgb(op.fill)} rg`);
        fill = op.fill;
      }
      out.push(`${num(op.x)} ${num(pageH - op.y - op.h)} ${num(op.w)} ${num(op.h)} re f`);
    } else if (op.k === "line") {
      if (op.color !== stroke) {
        out.push(`${rgb(op.color)} RG`);
        stroke = op.color;
      }
      const w = num(op.w);
      if (w !== width) {
        out.push(`${w} w`);
        width = w;
      }
      out.push(`${num(op.x1)} ${num(pageH - op.y1)} m ${num(op.x2)} ${num(pageH - op.y2)} l S`);
    } else {
      if (op.color !== fill) {
        out.push(`${rgb(op.color)} rg`);
        fill = op.color;
      }
      const w = textWidth(op.s, op.size, op.bold);
      const shift = op.align === "center" ? w / 2 : op.align === "right" ? w : 0;
      const font = op.bold ? "F2" : "F1";
      const y = pageH - op.y;
      const m = op.rot === 90 ? `0 1 -1 0 ${num(op.x)} ${num(y + shift * -1)} Tm` : `1 0 0 1 ${num(op.x - shift)} ${num(y)} Tm`;
      out.push(`BT /${font} ${num(op.size)} Tf ${m} ${pdfString(op.s)} Tj ET`);
    }
  }
  return out.join("\n") + "\n";
}

/** Turn the pages into the bytes of a PDF file. */
export function writePdf(doc: PdfDoc): Uint8Array {
  const objects: string[] = []; // objects[i] is object number i + 1
  const add = (body: string): number => objects.push(body);
  // 1 catalog, 2 page tree, 3 and 4 fonts, then (page, contents) pairs, then the info dictionary
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES"); // filled in below
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageNumbers: number[] = [];
  for (const page of doc.pages) {
    const stream = content(page.ops, page.height);
    const pageNo = objects.length + 1;
    pageNumbers.push(pageNo);
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`,
    );
    add(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNumbers.length} >>`;
  const infoNo = add(`<< /Title ${pdfString(doc.title)} /Producer (GridCrow) >>`);

  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(file.length);
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) file += `${String(o).padStart(10, "0")} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let i = 0; i < file.length; i++) bytes[i] = file.charCodeAt(i) & 255;
  return bytes;
}
