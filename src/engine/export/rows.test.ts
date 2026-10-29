import { describe, expect, it } from "vitest";
import { rowInstructions } from "./rows";
import { buildPatternModel } from "./pattern";
import { buildPdfDoc } from "./pdf";
import type { StitchMatrix } from "../convert/types";

const m: StitchMatrix = {
  cols: 5,
  rows: 3,
  palette: [{ hex: "#FFFFFF" }, { hex: "#000000" }] as StitchMatrix["palette"],
  // top row first; row 1 is the BOTTOM line
  cells: [
    [0, 0, 1, 0, 0],
    [1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1],
  ],
};

describe("row-by-row instructions", () => {
  const rows = rowInstructions(m);
  it("numbers rows from the bottom with RS on odd rows", () => {
    expect(rows.map((r) => r.side)).toEqual(["RS", "WS", "RS"]);
  });
  it("lists runs in working order: odd rows right to left, even left to right", () => {
    expect(rows[0].runs).toEqual([{ index: 1, count: 2 }, { index: 0, count: 3 }]); // bottom row read from the right
    expect(rows[1].runs).toEqual([{ index: 1, count: 2 }, { index: 0, count: 3 }]); // left to right
    expect(rows[2].runs).toEqual([{ index: 0, count: 2 }, { index: 1, count: 1 }, { index: 0, count: 2 }]);
  });
  it("every row adds up to the chart width (turning chains are never stitches)", () => {
    for (const r of rows) expect(r.runs.reduce((a, x) => a + x.count, 0)).toBe(5);
  });
  it("makes a PDF with a row label for every row and the foundation chain", () => {
    const doc = buildPdfDoc(buildPatternModel(m), { layout: "rows", letters: true });
    const texts = doc.pages.flatMap((p) => p.ops).filter((o) => o.k === "text");
    expect(texts.filter((t) => (t as { tag?: string }).tag === "row-label")).toHaveLength(3);
    expect(texts.some((t) => (t as { s: string }).s.includes("Chain 6."))).toBe(true);
  });
});
