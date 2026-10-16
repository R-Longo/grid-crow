import { describe, expect, it } from "vitest";
import { FINISHED_SIZES } from "../../config/sizes";
import { ROWS_PER_INCH, STITCHES_PER_INCH } from "../../config/gauge";
import { buildGridSpec } from "../geometry";
import {
  canvasSize,
  cellEdge,
  clampZoom,
  clientToCanvas,
  pointToStitch,
  scrollAfterZoom,
  stitchLabel,
} from "./coords";
import type { ChartLayout } from "./coords";

const ASPECT = ROWS_PER_INCH / STITCHES_PER_INCH;

/** The layout ChartView uses: zoom 1 fits the chart across the panel width. */
function layoutFor(cols: number, rows: number, panelWidth: number, zoom: number): ChartLayout {
  const cellH = (panelWidth / (cols * ASPECT)) * zoom;
  return { cols, rows, cellW: cellH * ASPECT, cellH };
}

describe("pointToStitch", () => {
  const sizes = FINISHED_SIZES.flatMap((s) =>
    (["portrait", "landscape"] as const).map((o) => buildGridSpec({ sizeId: s.id, orientation: o, maxColors: 10 })),
  );

  it("the centre, first pixel and last pixel of every stitch map to that stitch (every size, both orientations, several widths and zoom levels)", () => {
    for (const spec of sizes) {
      for (const width of [320, 375, 768, 1440]) {
        for (const zoom of [1, 2.25, 8]) {
          const l = layoutFor(spec.cols, spec.rows, width, zoom);
          for (let r = 0; r < spec.rows; r++) {
            const y0 = cellEdge(r, l.cellH);
            const y1 = cellEdge(r + 1, l.cellH);
            for (let c = 0; c < spec.cols; c++) {
              const x0 = cellEdge(c, l.cellW);
              const x1 = cellEdge(c + 1, l.cellW);
              const want = { col: c, row: r };
              if (x1 <= x0 || y1 <= y0) continue; // a stitch narrower than a pixel has no pixel of its own
              if (
                JSON.stringify(pointToStitch((x0 + x1) / 2, (y0 + y1) / 2, l)) !== JSON.stringify(want) ||
                JSON.stringify(pointToStitch(x0, y0, l)) !== JSON.stringify(want) ||
                JSON.stringify(pointToStitch(x1 - 0.001, y1 - 0.001, l)) !== JSON.stringify(want)
              ) {
                throw new Error(`${spec.sizeId} ${spec.orientation} width ${width} zoom ${zoom}: stitch (${c}, ${r}) mapped wrongly`);
              }
            }
          }
        }
      }
    }
  });

  it("points outside the chart are not stitches", () => {
    const l = layoutFor(96, 144, 375, 1);
    const { w, h } = canvasSize(l);
    expect(pointToStitch(-0.5, 10, l)).toBeNull();
    expect(pointToStitch(10, -0.5, l)).toBeNull();
    expect(pointToStitch(w, 10, l)).toBeNull();
    expect(pointToStitch(10, h, l)).toBeNull();
    expect(pointToStitch(w - 0.001, h - 0.001, l)).toEqual({ col: 95, row: 143 });
    expect(pointToStitch(NaN, 5, l)).toBeNull();
    expect(pointToStitch(5, 5, { cols: 0, rows: 0, cellW: 1, cellH: 1 })).toBeNull();
    expect(pointToStitch(5, 5, { cols: 10, rows: 10, cellW: 0, cellH: 0 })).toBeNull();
  });
});

describe("clientToCanvas", () => {
  it("accounts for where the canvas is on screen, including when the page has scrolled it off the left/top", () => {
    const box = { left: -240, top: -35, width: 800, height: 1200 };
    expect(clientToCanvas(0, 0, box, 800, 1200)).toEqual({ x: 240, y: 35 });
    expect(clientToCanvas(100, 200, box, 800, 1200)).toEqual({ x: 340, y: 235 });
  });
  it("scales back when the canvas is shown at a different size than its pixels", () => {
    const box = { left: 10, top: 20, width: 400, height: 600 }; // shown at half size
    expect(clientToCanvas(210, 320, box, 800, 1200)).toEqual({ x: 400, y: 600 });
  });
  it("gives up on a collapsed box", () => {
    expect(clientToCanvas(1, 1, { left: 0, top: 0, width: 0, height: 5 }, 10, 10)).toBeNull();
  });
});

describe("clicks through the whole path (client point -> canvas -> stitch)", () => {
  it("hits the right stitch when the chart is scrolled and zoomed", () => {
    const spec = buildGridSpec({ sizeId: "24x32", orientation: "portrait", maxColors: 10 });
    const l = layoutFor(spec.cols, spec.rows, 375, 4);
    const { w, h } = canvasSize(l);
    const scroll = { left: 313, top: 877 };
    const panel = { left: 12, top: 340 }; // viewport position of the scroll box
    const box = { left: panel.left - scroll.left, top: panel.top - scroll.top, width: w, height: h };
    // click at the centre of stitch (50, 70)
    const cx = box.left + (cellEdge(50, l.cellW) + cellEdge(51, l.cellW)) / 2;
    const cy = box.top + (cellEdge(70, l.cellH) + cellEdge(71, l.cellH)) / 2;
    const p = clientToCanvas(cx, cy, box, w, h);
    expect(p && pointToStitch(p.x, p.y, l)).toEqual({ col: 50, row: 70 });
  });
});

describe("numbering shown to people", () => {
  it("is 1-based, stitches from the left, row 1 at the bottom", () => {
    expect(stitchLabel({ col: 95, row: 143 }, 144, 96)).toEqual({ stitch: 1, row: 1 });
    expect(stitchLabel({ col: 0, row: 0 }, 144, 96)).toEqual({ stitch: 96, row: 144 });
    expect(stitchLabel({ col: 84, row: 109 }, 144, 96)).toEqual({ stitch: 12, row: 35 });
  });
});

describe("zoom", () => {
  it("clamps to the supported range", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(40)).toBe(8);
    expect(clampZoom(3.3)).toBe(3.3);
    expect(clampZoom(NaN)).toBe(1);
  });
  it("keeps the chart point under the pointer where it was", () => {
    for (const [oldZ, newZ] of [[1, 2], [2, 3.5], [8, 4], [1.5, 8]]) {
      const scroll = { left: 120 * oldZ, top: 80 * oldZ };
      const anchor = { x: 137, y: 211 };
      const after = scrollAfterZoom(scroll, anchor, oldZ, newZ);
      const contentBefore = { x: (scroll.left + anchor.x) / oldZ, y: (scroll.top + anchor.y) / oldZ };
      const contentAfter = { x: (after.left + anchor.x) / newZ, y: (after.top + anchor.y) / newZ };
      expect(contentAfter.x).toBeCloseTo(contentBefore.x, 9);
      expect(contentAfter.y).toBeCloseTo(contentBefore.y, 9);
    }
  });
});
