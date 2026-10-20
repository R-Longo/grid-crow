import { useCallback, useEffect, useRef, type RefObject } from "react";
import { cellEdge, type Stitch } from "../engine/editor/coords";
import { DIRECTION_ARROW, rowDirection, stitchNumber, visibleLabels } from "../engine/editor/rulers";

/** Height of the stitch-number ruler above the chart and width of the row-number gutter beside it, in CSS pixels. */
export const RULER_H = 20;
export const gutterWidth = (compact: boolean): number => (compact ? 36 : 46);

const ACTIVE = "#E8B84F";

interface Props {
  /** The scroll box whose content the rulers follow. */
  scrollRef: RefObject<HTMLDivElement | null>;
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  gutter: number;
  /** The stitch under the pointer or finger, if any: its row and stitch number are emphasised. */
  hover: Stitch | null;
  hidden?: boolean;
}

/**
 * Stitch numbers across the top (stitch 1 at the right) and row numbers down the left (row 1 at the bottom, with an
 * arrow for the direction that row is worked). Drawn on two small canvases that repaint on scroll (one animation
 * frame at a time) and only for the labels in view, so no React re-render happens while panning.
 */
export function Rulers({ scrollRef, cols, rows, cellW, cellH, gutter, hover, hidden }: Props) {
  const topRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ cols, rows, cellW, cellH, gutter, hover, hidden });
  latest.current = { cols, rows, cellW, cellH, gutter, hover, hidden };
  const frame = useRef(0);

  const draw = useCallback(() => {
    frame.current = 0;
    const sc = scrollRef.current;
    const top = topRef.current;
    const left = leftRef.current;
    if (!sc || !top || !left) return;
    const p = latest.current;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const vw = sc.clientWidth;
    const vh = sc.clientHeight;
    const setup = (cv: HTMLCanvasElement, w: number, h: number) => {
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (cv.width !== pw) cv.width = pw;
      if (cv.height !== ph) cv.height = ph;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      return ctx;
    };
    const tctx = setup(top, vw, RULER_H);
    const lctx = setup(left, p.gutter, vh);
    if (p.hidden || !(p.cellW > 0) || !(p.cellH > 0)) return;
    const color = getComputedStyle(top).color;
    const hovStitch = p.hover ? stitchNumber(p.hover.col, p.cols) : -1;
    const hovRow = p.hover ? stitchNumber(p.hover.row, p.rows) : -1;

    if (tctx) {
      tctx.textAlign = "center";
      tctx.textBaseline = "middle";
      // ticks: one per visible stitch edge
      if (p.cellW >= 4) {
        tctx.fillStyle = color;
        tctx.globalAlpha = 0.35;
        const a = Math.max(0, Math.floor(sc.scrollLeft / p.cellW) - 1);
        const b = Math.min(p.cols, Math.ceil((sc.scrollLeft + vw) / p.cellW) + 1);
        for (let i = a; i <= b; i++) {
          const x = cellEdge(i, p.cellW) - sc.scrollLeft;
          tctx.fillRect(Math.round(x), RULER_H - (i % 10 === 0 ? 6 : 3), 1, i % 10 === 0 ? 6 : 3);
        }
        tctx.globalAlpha = 1;
      }
      for (const l of visibleLabels({ count: p.cols, size: p.cellW, scroll: sc.scrollLeft, view: vw, minGap: 24 })) {
        const on = l.n === hovStitch;
        tctx.font = `${on || l.major ? 700 : 500} 11px system-ui, sans-serif`;
        tctx.fillStyle = on ? ACTIVE : color;
        tctx.fillText(String(l.n), l.pos, RULER_H / 2 - 2);
      }
    }
    if (lctx) {
      lctx.textBaseline = "middle";
      if (p.cellH >= 4) {
        lctx.fillStyle = color;
        lctx.globalAlpha = 0.35;
        const a = Math.max(0, Math.floor(sc.scrollTop / p.cellH) - 1);
        const b = Math.min(p.rows, Math.ceil((sc.scrollTop + vh) / p.cellH) + 1);
        for (let i = a; i <= b; i++) {
          const y = cellEdge(i, p.cellH) - sc.scrollTop;
          const n = p.rows - i; // the line above row `n` (rows count up from the bottom)
          lctx.fillRect(p.gutter - (n % 10 === 0 ? 6 : 3), Math.round(y), n % 10 === 0 ? 6 : 3, 1);
        }
        lctx.globalAlpha = 1;
      }
      for (const l of visibleLabels({ count: p.rows, size: p.cellH, scroll: sc.scrollTop, view: vh, minGap: 18 })) {
        const on = l.n === hovRow;
        lctx.font = `${on || l.major ? 700 : 500} 11px system-ui, sans-serif`;
        lctx.fillStyle = on ? ACTIVE : color;
        lctx.textAlign = "right";
        const y = Math.min(vh - 6, Math.max(6, l.pos)); // keep the end labels whole at the box edges
        lctx.fillText(String(l.n), p.gutter - 17, y);
        lctx.textAlign = "center";
        lctx.font = `${on ? 700 : 400} 11px system-ui, sans-serif`;
        lctx.fillText(DIRECTION_ARROW[rowDirection(l.n)], p.gutter - 9, y);
      }
    }
  }, [scrollRef]);

  const schedule = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    sc.addEventListener("scroll", schedule, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    ro?.observe(sc);
    window.addEventListener("resize", schedule);
    return () => {
      sc.removeEventListener("scroll", schedule);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [scrollRef, schedule]);

  // Anything that changes what the labels say or where they sit repaints right away (still one frame at most).
  useEffect(() => {
    draw();
  }, [draw, cols, rows, cellW, cellH, gutter, hover?.col, hover?.row, hidden]);

  return (
    <>
      <canvas ref={topRef} className="chart__ruler chart__ruler--top" aria-hidden="true" data-testid="ruler-top" />
      <canvas ref={leftRef} className="chart__ruler chart__ruler--left" aria-hidden="true" data-testid="ruler-left" />
    </>
  );
}
