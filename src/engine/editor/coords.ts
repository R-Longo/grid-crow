/**
 * Mapping between screen points and stitches, and the numbering shown to people.
 * Pure functions: no DOM, no canvas. The chart is drawn with cell edges at Math.round(i * cellSize), and
 * stitch lookup uses those same edges, so the stitch under a point is exactly the square drawn there.
 *
 * Inside the program a stitch is (col, row), both 0-based, row 0 at the TOP (the matrix's order).
 * People see 1-based numbers with row 1 at the BOTTOM (the way crochet charts are worked); that
 * convention lives only in `stitchLabel`.
 */

export interface ChartLayout {
  cols: number;
  rows: number;
  /** Width / height of one stitch in canvas pixels (may be fractional). */
  cellW: number;
  cellH: number;
}

export interface Stitch {
  col: number;
  row: number;
}

/** Canvas size in pixels, as the chart draws it. */
export function canvasSize(l: ChartLayout): { w: number; h: number } {
  return { w: Math.round(l.cols * l.cellW), h: Math.round(l.rows * l.cellH) };
}

/** Left (or top) edge of stitch i along an axis, in canvas pixels. */
export const cellEdge = (i: number, size: number): number => Math.round(i * size);

function indexAlong(p: number, count: number, size: number): number {
  let i = Math.min(count - 1, Math.max(0, Math.floor(p / size)));
  while (i > 0 && p < cellEdge(i, size)) i--;
  while (i < count - 1 && p >= cellEdge(i + 1, size)) i++;
  return i;
}

/** The stitch under canvas point (x, y), or null when the point is outside the chart. */
export function pointToStitch(x: number, y: number, l: ChartLayout): Stitch | null {
  if (!(l.cellW > 0) || !(l.cellH > 0) || l.cols < 1 || l.rows < 1) return null;
  const { w, h } = canvasSize(l);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= w || y >= h) return null;
  return { col: indexAlong(x, l.cols, l.cellW), row: indexAlong(y, l.rows, l.cellH) };
}

/**
 * Screen (client) point -> canvas pixel, from the canvas's on-screen box. If the browser or the page scales
 * the canvas (screen box size differs from its pixel size) the point is scaled back, so it stays exact.
 */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
): { x: number; y: number } | null {
  if (!(box.width > 0) || !(box.height > 0)) return null;
  return { x: ((clientX - box.left) * canvasW) / box.width, y: ((clientY - box.top) * canvasH) / box.height };
}

/** Numbers shown to people: 1-based, stitch 1 at the RIGHT edge (odd rows are worked right to left), row 1 at the bottom. */
export function stitchLabel(s: Stitch, rows: number, cols: number): { stitch: number; row: number } {
  return { stitch: cols - s.col, row: rows - s.row };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

/**
 * Zoom is measured so that 1 means "the chart is exactly as wide as the preview". The zoom that fits the WHOLE chart
 * in a preview of viewW x viewH is that, or less when the chart would then be taller than the preview (tall portrait
 * charts, or short screens such as a phone turned sideways). It never exceeds 1, so a wide chart is not enlarged past
 * the width of the preview. Rounded down a hair so rounding of canvas pixels can never push an edge out of view.
 * `cellAspect` = stitch width / stitch height.
 */
export function fitZoom(cols: number, rows: number, viewW: number, viewH: number, cellAspect: number): number {
  if (!(cols > 0 && rows > 0 && viewW > 0 && viewH > 0 && cellAspect > 0)) return 1;
  const heightAtWidthFit = (rows * viewW) / (cols * cellAspect);
  const f = Math.min(1, viewH / heightAtWidthFit);
  return Math.max(0.01, Math.floor(f * 1000) / 1000);
}

/**
 * How tall the chart preview may be for a window of this height: the window less room for the controls around the chart,
 * so the whole chart column (wide layout) or header + chart + bottom dock (compact layout) fits on screen. Never tiny or huge.
 */
export function previewHeight(windowH: number, compact = false, side = false): number {
  // `side`: a phone held sideways, where the dock sits beside the chart and only the header and caption are above and below it.
  return Math.min(1100, Math.max(side ? 200 : 260, windowH - (side ? 150 : compact ? 330 : 280)));
}

export function clampZoom(z: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (!Number.isFinite(z)) return min;
  return Math.min(max, Math.max(min, z));
}

/**
 * Scroll position that keeps the chart point under `anchor` (a point in the scroll box's viewport) fixed
 * while the zoom changes. The chart's size is proportional to zoom.
 */
export function scrollAfterZoom(
  scroll: { left: number; top: number },
  anchor: { x: number; y: number },
  oldZoom: number,
  newZoom: number,
): { left: number; top: number } {
  const k = newZoom / oldZoom;
  return { left: (scroll.left + anchor.x) * k - anchor.x, top: (scroll.top + anchor.y) * k - anchor.y };
}
