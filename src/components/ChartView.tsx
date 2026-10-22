import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ROWS_PER_INCH, STITCHES_PER_INCH } from "../config/gauge";
import { cropRect } from "../engine/convert/crop";
import type { DecodedImage } from "../engine/convert/decode";
import type { CropState, StitchMatrix } from "../engine/convert/types";
import {
  MAX_ZOOM,
  canvasSize,
  clampZoom,
  clientToCanvas,
  fitZoom,
  pointToStitch,
  scrollAfterZoom,
  stitchLabel,
} from "../engine/editor/coords";
import { cellEdge } from "../engine/editor/coords";
import { advance, clampProgress, nextStitch, percentDone, progressAfterTap, toEndOfRow } from "../engine/track/progress";
import type { ChartLayout, Stitch } from "../engine/editor/coords";
import type { Mode } from "../engine/editor/gesture";
import { colorCounts } from "../engine/editor/paint";
import { EditorSession } from "../engine/editor/session";
import type { Tool } from "../engine/editor/session";
import type { PointerInput, SessionEffect } from "../engine/editor/session";
import { drawChart, drawStitches } from "./chartPaint";
import { Icon } from "./Icon";
import { Rulers, RULER_H, gutterWidth } from "./Rulers";
import { directionLabel } from "../engine/editor/rulers";
import type { IconName } from "./Icon";
import { ColorEditor } from "./ColorEditor";
import { ConfirmReset } from "./ConfirmReset";
import { BLANK_BACKGROUND_SLOT } from "../engine/blank";
import type { AddColorResult, RecolorResult } from "../engine/editor/recolor";
import { DownloadPanel } from "./DownloadPanel";
import type { DownloadChoices, DownloadNote } from "./DownloadPanel";
import { buildPatternModel, patternFileName } from "../engine/export/pattern";
import { downloadBlob, renderPatternPng } from "../lib/exportPng";
import { renderPatternPdf } from "../lib/exportPdf";
import { afterExport, hasDownload, unsavedCount } from "../state/exportCheckpoint";
import type { ExportCheckpoint } from "../state/exportCheckpoint";
import { COMPACT_PROFILE, tiledPageCount } from "../engine/export/pdf/tiled";

/** Phones and narrow tablets get the compact editor: header, chart, then a bottom dock with the tools and yarn colors. */
export const COMPACT_QUERY = "(max-width: 56.24rem)";

/** Wider than a phone held upright (small tablets, phones held sideways): a slim rail with the tools and colors sits beside the chart. */
const SIDE_QUERY = "(max-width: 56.24rem) and (min-width: 36rem)";

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** A stitch is wider than a row is tall: 1/4 in across, 1/4.5 in high. */
const CELL_ASPECT = ROWS_PER_INCH / STITCHES_PER_INCH; // 1.125

// Grid lines are guides, never stitch colors. Light on a photo chart; gray on a blank canvas, where the stitches start white.
const LIGHT_LINES = { light: "rgba(255,255,255,0.16)", heavy: "rgba(255,255,255,0.4)" };
const GRAY_LINES = { light: "rgba(110,110,110,0.45)", heavy: "rgba(70,70,70,0.8)" };

function newSession(converted: StitchMatrix, startColor: number, current?: StitchMatrix): EditorSession {
  const session = new EditorSession(converted, current);
  if (startColor > 0 && startColor < converted.palette.length) session.setActive(startColor);
  return session;
}

interface ChartViewProps {
  matrix: StitchMatrix;
  image: DecodedImage | null;
  crop: CropState;
  aspect: number;
  /**
   * Told how many hand-edited stitches would be lost if the chart were replaced now (0 when nothing is at risk, and when the
   * chart goes away). After a download, only stitches edited since then count; `afterDownload` says which wording applies.
   */
  onEditedChange?: (unsaved: number, afterDownload: boolean) => void;
  /** A blank canvas (no picture behind it): yarn colors can be changed, the Original view is not offered, grid lines are gray. */
  blank?: boolean;
  /** The yarn color painting starts with (a blank canvas starts with black, not the white background). */
  startColor?: number;
  /** A saved, hand-edited version of the chart to open with (the converted chart is still kept for "Reset"). */
  initialMatrix?: StitchMatrix;
  /** Told whenever the editable chart changes, with the converted chart it belongs to (so a stale report can be ignored). */
  onMatrixChange?: (matrix: StitchMatrix, converted: StitchMatrix) => void;
  /** Extra buttons in the download panel (the project backup file). */
  onBackup?: () => void;
  /** Stitches crocheted so far, in working order. Kept (and saved) by the page, so it travels with the project. */
  progress?: number;
  onProgressChange?: (progress: number) => void;
}

/**
 * The stitch chart, and (Stage 4A) a way to edit it.
 *
 * The matrix is the only place colors live. The canvas is drawn from it; pointer input is turned into edits on the
 * matrix by the pure functions in `engine/editor`. Editing never touches the source picture and never re-runs the
 * conversion: `matrix` below starts as a copy of the converted chart and only changes by painting stitches with a
 * color the chart already has.
 */
export function ChartView({
  matrix: converted,
  image,
  crop,
  aspect,
  onEditedChange,
  blank = false,
  startColor = 0,
  initialMatrix,
  onMatrixChange,
  onBackup,
  progress = 0,
  onProgressChange,
}: ChartViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<"chart" | "original">("chart");
  // `zoom` is the zoom the person chose. While `fitted` is true the chart simply follows the fit, so it re-fits when the
  // preview changes size; once they zoom in it stays where they put it.
  const [chosenZoom, setZoomState] = useState(1);
  const [fitted, setFitted] = useState(true);
  const compact = useMedia(COMPACT_QUERY);
  const side = useMedia(SIDE_QUERY);
  const gutter = gutterWidth(compact);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsBtnRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  // Phones keep the download buttons in a "Download" panel next to Options (wide screens show them in the sidebar).
  const [downloadOpen, setDownloadOpen] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const downloadId = useId();
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);
  // PNG: clean color blocks unless asked. PDF: letters on (they help on a black-and-white print), one page, no tiling unless chosen.
  const [downloadChoices, setDownloadChoices] = useState<DownloadChoices>({
    pngLetters: false,
    pdfLayout: "fit",
    pdfLetters: true,
  });
  const [exportNote, setExportNote] = useState<DownloadNote | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [lines, setLines] = useState(true);
  // The room the chart has, measured from its container (not guessed from the window).
  const [width, setWidth] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [mode, setMode] = useState<Mode>("draw");
  // Track mode: tapping marks stitches as crocheted instead of painting. Dragging and pinching still move around.
  const [tracking, setTracking] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const trackRef = useRef<HTMLCanvasElement>(null);
  const tapRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const trackingRef = useRef(false);
  trackingRef.current = tracking;
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [active, setActive] = useState(startColor);
  const [tool, setTool] = useState<Tool>("paint");
  const [hover, setHover] = useState<Stitch | null>(null);
  const [matrix, setMatrix] = useState<StitchMatrix>(initialMatrix ?? converted);
  const [changed, setChanged] = useState(0);
  // The chart as it was when the last download started (null before the first download). Downloaded edits are safe in the file.
  const [checkpoint, setCheckpoint] = useState<ExportCheckpoint | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drawVersion, setDrawVersion] = useState(0);
  const zoomId = useId();
  const linesId = useId();
  const toolsId = useId();
  const colorsId = useId();
  const paletteRef = useRef<HTMLUListElement>(null);
  const optionsId = useId();

  // The editing session owns the converted chart (never modified) and the editable chart, plus the stroke and
  // gesture in progress. A new conversion starts a new session.
  const sessionRef = useRef<EditorSession | null>(null);
  if (!sessionRef.current || sessionRef.current.converted !== converted)
    sessionRef.current = newSession(converted, startColor, initialMatrix);
  const session = sessionRef.current;
  session.mode = tracking ? "pan" : mode;
  session.tool = tool;
  const viewRef = useRef(view);
  const zoomRef = useRef(1);
  const fitRef = useRef(1);
  const overRef = useRef(false);
  const resetBtnRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef(false);
  const refocusRef = useRef<"reset" | "status" | null>(null);
  const [note, setNote] = useState("");
  viewRef.current = view;
  confirmRef.current = confirmReset;

  // Let the page know whether there are hand edits to protect.
  const editedCb = useRef(onEditedChange);
  editedCb.current = onEditedChange;
  const unsaved = useMemo(() => unsavedCount(matrix, converted, checkpoint), [matrix, converted, checkpoint]);
  const downloaded = hasDownload(converted, checkpoint);
  useEffect(() => {
    editedCb.current?.(unsaved, downloaded);
  }, [unsaved, downloaded]);
  useEffect(() => () => editedCb.current?.(0, false), []);
  const matrixCb = useRef(onMatrixChange);
  matrixCb.current = onMatrixChange;
  useEffect(() => {
    matrixCb.current?.(matrix, converted);
  }, [matrix, converted]);

  // A new conversion replaces the chart being edited.
  useEffect(() => {
    setMatrix(initialMatrix ?? converted);
    setExportNote(null);
    setChanged(0);
    setConfirmReset(false);
    setFitted(true); // a new chart always opens showing the whole thing
    setActive(startColor < converted.palette.length ? startColor : 0);
    setTool("paint");
    setDrawVersion((v) => v + 1);
  }, [converted]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(Math.max(0, el.clientWidth - 2 - gutter)); // minus the scroll box's border
      setViewH(Math.max(0, el.clientHeight - RULER_H)); // the stitch-number ruler takes its own strip above the box
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact, gutter]); // the measured element is a new one when the layout switches

  // Zoom 1 = the chart is as wide as the preview. The "fit" zoom shows the whole chart, all four edges, in a preview of
  // this width and height (it is below 1 when the chart is taller than the preview). It is the slider's minimum.
  const fit = fitZoom(matrix.cols, matrix.rows, width, viewH - 2, CELL_ASPECT); // minus the box border, as for the width
  const zoom = fitted ? fit : clampZoom(chosenZoom, fit);
  zoomRef.current = zoom;
  fitRef.current = fit;
  // Height of one stitch in pixels.
  const cellH = width > 0 ? (width / (matrix.cols * CELL_ASPECT)) * zoom : 0;
  const cellW = cellH * CELL_ASPECT;
  const layout: ChartLayout = useMemo(
    () => ({ cols: matrix.cols, rows: matrix.rows, cellW, cellH }),
    [matrix.cols, matrix.rows, cellW, cellH],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const { w: pxW, h: pxH } = canvasSize(layout);

  // Full repaint when the size changes or the chart is replaced. Strokes repaint only the stitches they change.
  useEffect(() => {
    const el = chartRef.current;
    if (!el || pxW === 0) return;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    drawChart(ctx, session.matrix, layoutRef.current);
  }, [cellW, cellH, pxW, pxH, drawVersion, session, compact]); // `compact`: the canvases are new elements when the layout switches

  useEffect(() => {
    const el = linesRef.current;
    if (!el || pxW === 0) return;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, pxW, pxH);
    if (!lines || cellW < 4) return; // lines would swamp very small stitches
    const tone = blank ? GRAY_LINES : LIGHT_LINES;
    for (let c = 0; c <= matrix.cols; c++) {
      ctx.fillStyle = c % 10 === 0 ? tone.heavy : tone.light;
      ctx.fillRect(Math.min(pxW - 1, Math.round(c * cellW)), 0, 1, pxH);
    }
    for (let r = 0; r <= matrix.rows; r++) {
      ctx.fillStyle = r % 10 === 0 ? tone.heavy : tone.light;
      ctx.fillRect(0, Math.min(pxH - 1, Math.round(r * cellH)), pxW, 1);
    }
  }, [lines, blank, matrix.cols, matrix.rows, cellW, cellH, pxW, pxH, compact]);

  // Track overlay: stitches already crocheted are veiled, the row being worked is outlined and the next stitch is boxed.
  const trackPos = nextStitch(progress, matrix.cols, matrix.rows);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || pxW === 0) return;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, pxW, pxH);
    if (!tracking) return;
    const { cols, rows } = matrix;
    const x = (c: number) => cellEdge(c, cellW);
    const y = (r: number) => cellEdge(r, cellH);
    ctx.fillStyle = "rgba(20, 16, 12, 0.62)";
    const fullRows = Math.floor(progress / cols);
    if (fullRows > 0) ctx.fillRect(0, y(rows - fullRows), pxW, pxH - y(rows - fullRows));
    const j = progress % cols;
    if (fullRows < rows && j > 0) {
      const ri = rows - 1 - fullRows;
      if (fullRows % 2 === 0) ctx.fillRect(x(cols - j), y(ri), pxW - x(cols - j), y(ri + 1) - y(ri));
      else ctx.fillRect(0, y(ri), x(j), y(ri + 1) - y(ri));
    }
    if (trackPos) {
      ctx.strokeStyle = "#e8b84f";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, y(trackPos.rowIndex) + 1, pxW - 2, y(trackPos.rowIndex + 1) - y(trackPos.rowIndex) - 2);
      ctx.lineWidth = Math.max(2, Math.min(4, cellW / 3));
      ctx.strokeStyle = "#ffffff";
      ctx.strokeRect(x(trackPos.col), y(trackPos.rowIndex), x(trackPos.col + 1) - x(trackPos.col), y(trackPos.rowIndex + 1) - y(trackPos.rowIndex));
    }
  }, [tracking, progress, matrix.cols, matrix.rows, cellW, cellH, pxW, pxH, compact, drawVersion]);

  // Keep the row being worked in view when it moves.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!tracking || !sc || !trackPos || cellH === 0) return;
    const top = cellEdge(trackPos.rowIndex, cellH);
    const bottom = cellEdge(trackPos.rowIndex + 1, cellH);
    if (top < sc.scrollTop || bottom > sc.scrollTop + sc.clientHeight)
      sc.scrollTop = Math.max(0, top - sc.clientHeight / 2 + (bottom - top) / 2);
    const left = cellEdge(trackPos.col, cellW);
    const right = cellEdge(trackPos.col + 1, cellW);
    if (left < sc.scrollLeft || right > sc.scrollLeft + sc.clientWidth)
      sc.scrollLeft = Math.max(0, left - sc.clientWidth / 2 + (right - left) / 2);
  }, [tracking, trackPos?.row, trackPos?.col, cellW, cellH]); // eslint-disable-line react-hooks/exhaustive-deps

  // Original (cropped) picture, for comparison only. Read-only: never part of the chart, never edited.
  useEffect(() => {
    const el = originalRef.current;
    if (view !== "original" || !el || !image || pxW === 0) return;
    el.width = pxW;
    el.height = pxH;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const r = cropRect(image.width, image.height, aspect, crop);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.bitmap, r.x, r.y, r.w, r.h, 0, 0, pxW, pxH);
  }, [view, image, crop, aspect, pxW, pxH, compact]);

  const counts = useMemo(() => colorCounts(matrix), [matrix]);

  // ---- zoom -----------------------------------------------------------------------------------------------
  /** Change the zoom keeping the chart point under `anchor` (a point in the scroll box's viewport) where it is. */
  const setZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
    const sc = scrollRef.current;
    const old = zoomRef.current;
    const z = clampZoom(next, fitRef.current);
    if (z === old) return;
    const box0 = sc?.getBoundingClientRect();
    const a = anchor ?? { x: (box0?.width ?? 0) / 2, y: (box0?.height ?? 0) / 2 };
    const scroll = { left: sc?.scrollLeft ?? 0, top: sc?.scrollTop ?? 0 };
    zoomRef.current = z;
    flushSync(() => {
      setZoomState(z);
      setFitted(z <= fitRef.current);
    }); // lay the chart out at its new size before moving the scroll position
    if (sc && box0) {
      // The preview box hugs a chart that is smaller than it, so it can move or resize as the chart grows. Hold the point
      // under the pointer at the same place on screen.
      const box1 = sc.getBoundingClientRect();
      const s = scrollAfterZoom(scroll, a, old, z);
      sc.scrollLeft = s.left + (box1.left - box0.left);
      sc.scrollTop = s.top + (box1.top - box0.top);
    }
  }, []);

  /** Show the whole chart again and drop any panning. */
  const fitToScreen = useCallback(() => {
    setFitted(true);
    const sc = scrollRef.current;
    if (sc) {
      sc.scrollLeft = 0;
      sc.scrollTop = 0;
    }
  }, []);

  // Ctrl/Cmd + wheel (and a trackpad pinch, which browsers send the same way) zooms under the pointer.
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const box = sc.getBoundingClientRect();
      setZoom(zoomRef.current * Math.exp(-e.deltaY * 0.0025), {
        x: e.clientX - box.left - sc.clientLeft,
        y: e.clientY - box.top - sc.clientTop,
      });
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => sc.removeEventListener("wheel", onWheel);
  }, [setZoom, compact]); // the scroll box is a new element when the layout switches

  // Holding Space turns a mouse drag into a pan (only while the pointer is over the chart).
  useEffect(() => {
    // Text fields keep their Space. A focused button (such as the Draw / Pan toggle just clicked) does not: while the
    // pointer is over the chart, Space means "pan", and its keyup is swallowed so it cannot also press that button.
    const ignore = (t: EventTarget | null) =>
      t instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !overRef.current || ignore(e.target)) return;
      sessionRef.current!.space = true;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const sess = sessionRef.current!;
      if (sess.space) e.preventDefault();
      sess.space = false;
    };
    const blur = () => {
      sessionRef.current!.space = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // ---- editing --------------------------------------------------------------------------------------------
  const stitchAt = useCallback((clientX: number, clientY: number): Stitch | null => {
    const el = chartRef.current;
    if (!el) return null;
    const l = layoutRef.current;
    const { w, h } = canvasSize(l);
    const p = clientToCanvas(clientX, clientY, el.getBoundingClientRect(), w, h);
    return p ? pointToStitch(p.x, p.y, l) : null;
  }, []);

  const paintOnCanvas = useCallback((stitches: Parameters<typeof drawStitches>[3]) => {
    const ctx = chartRef.current?.getContext("2d");
    if (ctx) drawStitches(ctx, sessionRef.current!.matrix, layoutRef.current, stitches);
  }, []);

  const applyEffects = useCallback(
    (effects: SessionEffect[]) => {
      for (const e of effects) {
        switch (e.type) {
          case "repaint":
            paintOnCanvas(e.stitches);
            break;
          case "hover":
            setHover((h) => (h && h.col === e.stitch.col && h.row === e.stitch.row ? h : e.stitch));
            break;
          case "committed":
            setMatrix(sessionRef.current!.matrix);
            setChanged(e.changed);
            setConfirmReset(false);
            setNote(
              e.action === "undo" || e.action === "redo"
                ? `${e.action === "undo" ? "Undid" : "Redid"} ${e.stitches} ${e.stitches === 1 ? "stitch" : "stitches"}.`
                : e.action === "fill"
                  ? `Filled ${e.stitches} ${e.stitches === 1 ? "stitch" : "stitches"}.`
                  : "",
            );
            break;
          case "colorChosen":
            setActive(e.color);
            break;
          case "picked":
            setActive(e.color);
            setTool("paint");
            setNote(`Picked ${sessionRef.current!.matrix.palette[e.color].hex.toUpperCase()}. Back to painting.`);
            break;
          case "pan": {
            const sc = scrollRef.current;
            if (sc) {
              sc.scrollLeft -= e.dx;
              sc.scrollTop -= e.dy;
            }
            break;
          }
          case "pinch": {
            const sc = scrollRef.current;
            if (!sc) break;
            const box = sc.getBoundingClientRect();
            setZoom(zoomRef.current * e.scale, {
              x: e.cx - box.left - sc.clientLeft,
              y: e.cy - box.top - sc.clientTop,
            });
            sc.scrollLeft -= e.dx;
            sc.scrollTop -= e.dy;
            break;
          }
        }
      }
    },
    [paintOnCanvas, setZoom],
  );

  const feed = useCallback(
    (input: PointerInput) => applyEffects(sessionRef.current!.handle(input, stitchAt)),
    [applyEffects, stitchAt],
  );

  const setProgress = (n: number) => {
    const next = clampProgress(n, matrix.cols, matrix.rows);
    if (next !== progressRef.current) onProgressChange?.(next);
  };
  const kindOf = (t: string) => (t === "touch" ? "touch" : t === "pen" ? "pen" : "mouse");

  const onPointerDown = (e: React.PointerEvent) => {
    if (viewRef.current !== "chart") return;
    if (trackingRef.current) {
      // A tap marks a stitch; a drag or a second finger is moving around instead.
      tapRef.current = tapRef.current ? { ...tapRef.current, moved: true } : { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    }
    if (e.button === 1) e.preventDefault(); // no middle-click autoscroll
    try {
      stageRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a convenience; strokes still work without it */
    }
    feed({ type: "down", id: e.pointerId, kind: kindOf(e.pointerType), x: e.clientX, y: e.clientY, button: e.button });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (viewRef.current !== "chart") return;
    if (e.buttons === 0 && e.pointerType === "mouse") {
      const st = stitchAt(e.clientX, e.clientY);
      setHover((h) => (h === st || (h && st && h.col === st.col && h.row === st.row) ? h : st));
    }
    const tap = tapRef.current;
    if (tap && !tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
    feed({ type: "move", id: e.pointerId, x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const tap = tapRef.current;
    if (tap && tap.id === e.pointerId) {
      tapRef.current = null;
      if (!tap.moved && trackingRef.current) {
        const st = stitchAt(e.clientX, e.clientY);
        if (st) {
          const after = progressAfterTap(st.col, st.row, matrix.cols, matrix.rows);
          // Tapping the last stitch you marked takes it back, so a slip of the finger is easy to fix.
          setProgress(after === progressRef.current ? after - 1 : after);
        }
      }
    }
    feed({ type: "up", id: e.pointerId });
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    if (tapRef.current?.id === e.pointerId) tapRef.current = null;
    feed({ type: "cancel", id: e.pointerId });
  };

  // Leaving the chart view in the middle of a gesture must not leave a stroke half-open.
  useLayoutEffect(() => {
    if (view !== "chart") applyEffects(sessionRef.current!.cancelGesture());
  }, [view, applyEffects]);

  useEffect(() => {
    if (confirmReset || !refocusRef.current) return;
    (refocusRef.current === "status" ? statusRef.current : resetBtnRef.current)?.focus();
    refocusRef.current = null;
  }, [confirmReset]);

  const undo = () => applyEffects(sessionRef.current!.undo());
  const redo = () => applyEffects(sessionRef.current!.redo());

  // Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z or Ctrl+Y redoes. Text fields keep their own undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable))
        return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) undo();
      else if ((k === "z" && e.shiftKey) || k === "y") redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // On phones the yarn colors scroll sideways: keep the selected one in view (the eyedropper can select any of them).
  useEffect(() => {
    const ul = paletteRef.current;
    const btn = ul?.querySelector<HTMLElement>('button[aria-pressed="true"]');
    if (!ul || !btn || ul.scrollWidth <= ul.clientWidth) return;
    const left = btn.parentElement!.offsetLeft - ul.offsetLeft;
    const right = left + btn.offsetWidth;
    if (left < ul.scrollLeft) ul.scrollLeft = left - 8;
    else if (right > ul.scrollLeft + ul.clientWidth) ul.scrollLeft = right - ul.clientWidth + 8;
  }, [active, matrix.palette]);

  // A new chart is brought to the top of the screen, so the whole thing (and, on a phone, the dock under it) is in view.
  // (Done once the chart has been laid out: before that the page is too short to scroll that far.)
  const scrolledFor = useRef<StitchMatrix | null>(null);
  useEffect(() => {
    if (pxH === 0 || scrolledFor.current === converted) return;
    scrolledFor.current = converted;
    sectionRef.current?.scrollIntoView({ block: "start" });
  }, [converted, pxH]);

  // The Options and Download panels (phones) close with Escape or a tap outside them.
  const panelOpen = optionsOpen || downloadOpen;
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inside = [optionsRef, optionsBtnRef, downloadRef, downloadBtnRef].some((r) => r.current?.contains(t));
      if (inside) return;
      setOptionsOpen(false);
      setDownloadOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmRef.current) return;
      (optionsOpen ? optionsBtnRef : downloadBtnRef).current?.focus();
      setOptionsOpen(false);
      setDownloadOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, optionsOpen]);
  useEffect(() => {
    if (!compact) {
      setOptionsOpen(false);
      setDownloadOpen(false);
    }
  }, [compact]);

  // Download the chart as it is RIGHT NOW (the session's matrix is the single source of truth), never the picture or a screenshot.
  const exportPng = async () => {
    if (exporting) return;
    setExporting("png");
    setExportNote(null);
    try {
      // The chart as it is when the export starts: this is what the file contains, and what counts as downloaded.
      const exportSession = sessionRef.current!;
      const snapshot = exportSession.matrix;
      const model = buildPatternModel(snapshot);
      const name = patternFileName(model, "png");
      const blob = await renderPatternPng(model, { letters: downloadChoices.pngLetters });
      if (!downloadBlob(blob, name)) throw new Error("The browser did not start the download.");
      // Only now, with the browser holding the file, do these edits count as downloaded. Stitches painted while the
      // file was being made are not in it, so they stay unsaved.
      setCheckpoint((cur) => afterExport(cur, exportSession.converted, snapshot, true));
      setExportNote({ kind: "ok", text: `Downloaded ${name}` });
    } catch (e) {
      setExportNote({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong making the PNG." });
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    if (exporting) return;
    setExporting("pdf");
    setExportNote(null);
    try {
      const exportSession = sessionRef.current!;
      const snapshot = exportSession.matrix;
      const model = buildPatternModel(snapshot);
      const layoutKind = downloadChoices.pdfLayout;
      const name = patternFileName(model, "pdf", layoutKind === "tiled" ? "large-print" : layoutKind === "compact" ? "compact" : "");
      const blob = await renderPatternPdf(model, {
        layout: downloadChoices.pdfLayout,
        letters: downloadChoices.pdfLetters,
      });
      if (!downloadBlob(blob, name)) throw new Error("The browser did not start the download.");
      // Only now, with the browser holding the file, do these edits count as downloaded. Stitches painted while the
      // file was being made are not in it, so they stay unsaved.
      setCheckpoint((cur) => afterExport(cur, exportSession.converted, snapshot, true));
      setExportNote({ kind: "ok", text: `Downloaded ${name}` });
    } catch (e) {
      setExportNote({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong making the PDF." });
    } finally {
      setExporting(null);
    }
  };

  const chooseColor = (i: number) => {
    sessionRef.current!.setActive(i);
    setActive(i);
  };

  const closeConfirm = (afterReset: boolean) => {
    // Put focus somewhere sensible once the dialog is gone: back on the Reset button, or (when it is now
    // disabled) on the status line.
    refocusRef.current = afterReset ? "status" : "reset";
    setConfirmReset(false);
  };

  const resetToConverted = () => {
    sessionRef.current!.reset();
    setTool("paint");
    setMatrix(converted);
    setChanged(0);
    setDrawVersion((v) => v + 1);
    setActive(sessionRef.current!.active);
    setNote(blank ? "Reset to the blank canvas." : "Reset to the converted chart.");
    closeConfirm(true);
  };

  // Blank canvas: change the yarn color of the selected slot. Every stitch using it changes (one undo step).
  const recolorActive = (hex: string): RecolorResult => {
    const { result, effects } = sessionRef.current!.recolor(active, hex);
    if (result.ok) {
      applyEffects(effects);
      setNote(`Recolored to ${result.to.toUpperCase()}.`);
    }
    return result;
  };

  // Add a new yarn color to the palette and paint with it (one undo step); nothing already painted changes.
  const addNewColor = (hex: string): AddColorResult => {
    const { result, effects } = sessionRef.current!.addColor(hex);
    if (result.ok) {
      applyEffects(effects);
      setNote(`Added ${result.hex.toUpperCase()}. Paint with it now.`);
    }
    return result;
  };

  const activeColor = matrix.palette[active] ?? matrix.palette[0];
  const label = hover ? stitchLabel(hover, matrix.rows, matrix.cols) : null;

  const TOOLS: Array<{ id: Tool | "pan"; label: string; short: string; icon: IconName }> = [
    { id: "paint", label: "Paint", short: "Paint", icon: "pencil" },
    { id: "fill", label: "Fill", short: "Fill", icon: "fill" },
    { id: "pick", label: "Eyedropper", short: "Pick", icon: "dropper" },
    { id: "pan", label: "Pan", short: "Pan", icon: "hand" },
  ];
  const selectedTool: Tool | "pan" = mode === "pan" ? "pan" : tool;
  const chooseTool = (id: Tool | "pan") => {
    if (id === "pan") setMode("pan");
    else {
      setMode("draw");
      setTool(id);
    }
  };
  const help =
    view !== "chart"
      ? "This is your original picture, for comparing. Switch back to Chart to edit."
      : selectedTool === "paint"
        ? "Tap or drag to paint with the selected color."
        : selectedTool === "fill"
          ? "Tap a region to fill all its connected stitches."
          : selectedTool === "pick"
            ? "Tap a stitch to copy its color, then paint."
            : "Drag to move around. Two fingers always pan and zoom.";
  const helpFull = view === "chart" ? `${help} Change any yarn color with Edit this color.` : help;
  const summary = `${matrix.cols} stitches × ${matrix.rows} rows · ${matrix.palette.length} ${
    matrix.palette.length === 1 ? "color" : "colors"
  }`;

  // ---- pieces shared by the wide and the compact layout --------------------------------------------------------
  const viewToggle = blank ? null : (
    <div className="chart__toggle" role="group" aria-label="What to show">
      <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
        Chart
      </button>
      <button type="button" aria-pressed={view === "original"} disabled={!image || tracking} onClick={() => setView("original")}>
        Original
      </button>
    </div>
  );
  const gridCheck = (
    <label className="chart__check" htmlFor={linesId}>
      <input id={linesId} type="checkbox" checked={lines} onChange={(e) => setLines(e.target.checked)} />
      Show grid lines
    </label>
  );
  const toolButtons = TOOLS.map((t) => (
    <button
      key={t.id}
      type="button"
      className="chart__tool"
      aria-pressed={selectedTool === t.id}
      aria-label={t.label}
      disabled={view !== "chart"}
      onClick={() => chooseTool(t.id)}
    >
      <Icon name={t.icon} size={22} />
      <span aria-hidden="true">{compact ? t.short : t.label}</span>
    </button>
  ));
  const historyButtons = (
    <>
      <button type="button" className="chart__small" disabled={!session.canUndo} onClick={undo}>
        <Icon name="undo" size={20} />
        <span>Undo</span>
      </button>
      <button type="button" className="chart__small" disabled={!session.canRedo} onClick={redo}>
        <Icon name="redo" size={20} />
        <span>Redo</span>
      </button>
    </>
  );
  const colorEditor = (
    <ColorEditor
      slot={active}
      color={matrix.palette[active] ?? matrix.palette[0]}
      count={counts[active] ?? 0}
      isBackground={blank && active === BLANK_BACKGROUND_SLOT}
      onApply={recolorActive}
      onAdd={addNewColor}
      describeSlot={(i) =>
        `${matrix.palette[i].hex.toUpperCase()}${blank && i === BLANK_BACKGROUND_SLOT ? ", your background" : ""}`
      }
    />
  );
  const palette = (
    <ul ref={paletteRef} className="chart__palette" aria-labelledby={colorsId}>
      {matrix.palette.map((p, i) => (
        <li key={blank ? i : p.hex}>
          <button
            type="button"
            className="chart__color"
            aria-pressed={i === active}
            aria-label={`Paint with ${p.hex.toUpperCase()}, ${counts[i]} stitches`}
            onClick={() => chooseColor(i)}
          >
            <span className="chart__swatch" style={{ background: p.hex }} aria-hidden="true" />
            <span className="chart__hex">{p.hex.toUpperCase()}</span>
            <span className="chart__count">{counts[i]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
  const editStatus = compact ? (
    <p className="chart__status" data-testid="chart-status" ref={statusRef} tabIndex={-1}>
      <span className="chart__swatch" style={{ background: activeColor.hex }} aria-hidden="true" />
      <span className="chart__current">
        {tool === "fill" ? "Fill " : tool === "pick" ? "Pick from chart · " : ""}
        <strong>{activeColor.hex.toUpperCase()}</strong> · {counts[active]} st
      </span>
      <span className="chart__where">
        {label
          ? `Stitch ${label.stitch} · Row ${label.row} · ${directionLabel(label.row)}`
          : `${matrix.cols} × ${matrix.rows} · ${matrix.palette.length} colors`}
      </span>
    </p>
  ) : (
    <p className="chart__status" data-testid="chart-status" ref={statusRef} tabIndex={-1}>
      <span className="chart__swatch" style={{ background: activeColor.hex }} aria-hidden="true" />
      <span>
        {tool === "fill"
          ? "Filling with"
          : tool === "pick"
            ? "Tap a stitch to pick its color. Current:"
            : "Painting with"}{" "}
        <strong>{activeColor.hex.toUpperCase()}</strong>
      </span>
      <span className="chart__where">
        {label
          ? `Stitch ${label.stitch} of ${matrix.cols} · Row ${label.row} of ${matrix.rows} · ${directionLabel(label.row)}`
          : "Move over the chart to see stitch numbers"}
      </span>
    </p>
  );
  const total = matrix.cols * matrix.rows;
  const finished = progress >= total;
  const trackBar = (
    <div className="track" data-testid="track-bar">
      <p className="track__where" data-testid="track-where" role="status" aria-live="polite">
        {finished || !trackPos ? (
          <strong>All {matrix.rows} rows are done. Beautiful work.</strong>
        ) : (
          <>
            <span>
              Row <strong>{trackPos.row}</strong> of {matrix.rows}
            </span>
            <span>
              Stitch <strong>{trackPos.stitch}</strong> of {matrix.cols}
            </span>
            <span className="track__dir">{trackPos.direction === "left" ? "← right to left" : "left to right →"}</span>
          </>
        )}
        <span className="track__pct" data-testid="track-pct">{percentDone(progress, matrix.cols, matrix.rows)}% done</span>
      </p>
      <div className="track__buttons">
        <button type="button" className="chart__small track__next" data-testid="track-next" disabled={finished} onClick={() => setProgress(advance(progress, 1, matrix.cols, matrix.rows))}>
          Next stitch
        </button>
        <button type="button" className="chart__small" data-testid="track-back" disabled={progress === 0} onClick={() => setProgress(advance(progress, -1, matrix.cols, matrix.rows))}>
          Back
        </button>
        <button type="button" className="chart__small" data-testid="track-row" disabled={finished} onClick={() => setProgress(advance(progress, toEndOfRow(progress, matrix.cols, matrix.rows), matrix.cols, matrix.rows))}>
          Finish row
        </button>
        {confirmStart ? (
          <>
            <button type="button" className="chart__small" data-testid="track-restart-yes" onClick={() => { setConfirmStart(false); setProgress(0); }}>
              Yes, start over
            </button>
            <button type="button" className="chart__small" onClick={() => setConfirmStart(false)}>
              Keep progress
            </button>
          </>
        ) : (
          <button type="button" className="chart__small" data-testid="track-restart" disabled={progress === 0} onClick={() => setConfirmStart(true)}>
            Start over
          </button>
        )}
      </div>
      <p className="track__hint">Tap a stitch to mark everything up to it. Tap the last marked stitch again to take it back.</p>
    </div>
  );
  const status = tracking ? trackBar : editStatus;
  const modeToggle = (
    <div className="chart__toggle chart__modebar" role="group" aria-label="What to do">
      <button type="button" data-testid="mode-edit" aria-pressed={!tracking} onClick={() => setTracking(false)}>
        Edit
      </button>
      <button
        type="button"
        data-testid="mode-track"
        aria-pressed={tracking}
        onClick={() => {
          setView("chart");
          setTracking(true);
        }}
      >
        Track
      </button>
    </div>
  );
  const chartBox = (
    <div ref={wrapRef} className="chart__wrap">
      <div className="chart__frame" style={{ gridTemplateColumns: `${gutter}px auto` }}>
        <Rulers
          scrollRef={scrollRef}
          cols={matrix.cols}
          rows={matrix.rows}
          cellW={cellW}
          cellH={cellH}
          gutter={gutter}
          hover={view === "chart" ? hover : null}
          hidden={view !== "chart"}
        />
        <div
          ref={scrollRef}
          className="chart__scroll"
          // The box is as big as the chart, up to the room there is; a chart that fits is shown whole, with no scrollbars.
          style={pxW && viewH > 0 ? { width: Math.min(width, pxW) + 2, height: Math.min(viewH, pxH + 2) } : undefined}
        >
          <div
            ref={stageRef}
            className={`chart__stage${view === "chart" ? ` chart__stage--${tracking ? "pan" : mode}${!tracking && mode === "draw" && tool !== "paint" ? ` chart__stage--${tool}` : ""}` : ""}`}
            style={{ width: pxW || undefined, height: pxH || undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerEnter={() => {
              overRef.current = true;
            }}
            onPointerLeave={() => {
              overRef.current = false;
              setHover(null);
            }}
            onContextMenu={(e) => {
              if (view === "chart") e.preventDefault();
            }}
          >
            <canvas
              ref={chartRef}
              className="chart__canvas"
              role="img"
              aria-label={`Stitch chart, ${matrix.cols} stitches by ${matrix.rows} rows`}
              hidden={view !== "chart"}
              data-testid="chart-canvas"
            />
            <canvas ref={linesRef} className="chart__lines" aria-hidden="true" hidden={view !== "chart"} />
            <canvas ref={trackRef} className="chart__lines" aria-hidden="true" data-testid="track-canvas" hidden={view !== "chart" || !tracking} />
            <canvas
              ref={originalRef}
              className="chart__canvas"
              role="img"
              aria-label="Your original picture, cropped"
              hidden={view !== "original"}
            />
            {view === "chart" && hover && !tracking ? (
              <>
                <div
                  className="chart__hl chart__hl--row"
                  data-testid="hl-row"
                  aria-hidden="true"
                  style={{
                    top: cellEdge(hover.row, cellH),
                    height: cellEdge(hover.row + 1, cellH) - cellEdge(hover.row, cellH),
                  }}
                />
                <div
                  className="chart__hl chart__hl--col"
                  data-testid="hl-col"
                  aria-hidden="true"
                  style={{
                    left: cellEdge(hover.col, cellW),
                    width: cellEdge(hover.col + 1, cellW) - cellEdge(hover.col, cellW),
                  }}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
  const fitButton = (
    <button type="button" className="chart__small" disabled={view !== "chart" || zoom <= fit} onClick={fitToScreen}>
      <Icon name="fit" size={18} />
      <span className="chart__btntext">Fit to Screen</span>
    </button>
  );
  const zoomControls = (
    <>
      <button
        type="button"
        className="chart__round"
        aria-label="Zoom out"
        disabled={zoom <= fit}
        onClick={() => setZoom(zoom / 1.25)}
      >
        <Icon name="minus" size={18} />
      </button>
      <label htmlFor={zoomId} className="visually-hidden">
        Zoom
      </label>
      <input
        id={zoomId}
        type="range"
        min={fit}
        max={MAX_ZOOM}
        step="any"
        value={zoom}
        aria-valuetext={zoom <= fit ? "Whole chart" : `${(zoom / fit).toFixed(1)} times the whole-chart size`}
        onChange={(e) => setZoom(Number(e.target.value))}
      />
      <button
        type="button"
        className="chart__round"
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
        onClick={() => setZoom(zoom * 1.25)}
      >
        <Icon name="plus" size={18} />
      </button>
      <span className="chart__percent" aria-hidden="true">
        {Math.round(zoom * 100)}%
      </span>
    </>
  );
  const utility = (
    <>
      <span className="chart__changed" data-testid="chart-changed">
        {changed === 0 ? "No edits yet" : `${changed} ${changed === 1 ? "stitch" : "stitches"} changed`}
        {changed > 0 && downloaded && (
          <span data-testid="chart-unsaved">
            {" · "}
            {unsaved === 0 ? "all downloaded" : `${unsaved} not downloaded yet`}
          </span>
        )}
      </span>
      <button
        ref={resetBtnRef}
        type="button"
        className="chart__small chart__small--quiet"
        disabled={changed === 0 || confirmReset}
        onClick={() => {
          setNote("");
          setConfirmReset(true);
        }}
      >
        <Icon name="reset" size={18} />
        {blank ? "Reset canvas" : "Reset to converted"}
      </button>
      {confirmReset && (
        <ConfirmReset
          changed={changed}
          blank={blank}
          onConfirm={resetToConverted}
          onCancel={() => closeConfirm(false)}
        />
      )}
    </>
  );
  const announce = (
    <p className="visually-hidden" role="status">
      {note}
    </p>
  );

  // ---- compact layout: header, the chart, then a dock with yarn colors and tools --------------------------------
  if (compact) {
    return (
      <section
        ref={sectionRef}
        className={`chart chart--compact${side ? " chart--side" : ""}`}
        aria-label="Your crochet chart"
      >
        <div className="chart__bar">
          <h2 className="visually-hidden">Your chart</h2>
          {fitButton}
          <button
            ref={optionsBtnRef}
            type="button"
            className="chart__small"
            aria-expanded={optionsOpen}
            aria-controls={optionsId}
            onClick={() => {
              setDownloadOpen(false);
              setOptionsOpen((o) => !o);
            }}
          >
            <Icon name="options" size={18} />
            <span className="chart__btntext">Options</span>
          </button>
          <button
            ref={downloadBtnRef}
            type="button"
            className="chart__small"
            aria-expanded={downloadOpen}
            aria-controls={downloadId}
            data-testid="download-open"
            onClick={() => {
              setOptionsOpen(false);
              setDownloadOpen((o) => !o);
            }}
          >
            <Icon name="download" size={18} />
            <span className="chart__btntext">Download</span>
          </button>
          {downloadOpen && (
            <div
              ref={downloadRef}
              id={downloadId}
              className="chart__options"
              role="region"
              aria-label="Download your pattern"
            >
              <DownloadPanel
                onPng={exportPng}
                onPdf={exportPdf}
                busy={exporting}
                note={exportNote}
                choices={downloadChoices}
                onChoices={setDownloadChoices}
                tiledPages={tiledPageCount(matrix.cols, matrix.rows)}
                compactPages={tiledPageCount(matrix.cols, matrix.rows, COMPACT_PROFILE)}
                onBackup={onBackup}
              />
            </div>
          )}
          {optionsOpen && (
            <div ref={optionsRef} id={optionsId} className="chart__options" role="region" aria-label="Chart options">
              <p className="chart__summary">{summary}</p>
              {viewToggle && <div className="chart__options-row">{viewToggle}</div>}
              {colorEditor && <div className="chart__options-row">{colorEditor}</div>}
              <div className="chart__options-row">{gridCheck}</div>
              <div className="chart__options-row chart__zoombar chart__zoom">{zoomControls}</div>
              <div className="chart__edit chart__options-row">{utility}</div>
              <p className="chart__help" data-testid="chart-help">
                {helpFull}
              </p>
            </div>
          )}
        </div>

        {modeToggle}
        {chartBox}
        {status}

        <div className="chart__dock" hidden={tracking}>
          <h3 id={colorsId} className="visually-hidden">
            Yarn colors
          </h3>
          {palette}
          <div className="chart__dockbar" role="group" aria-labelledby={toolsId}>
            <h3 id={toolsId} className="visually-hidden">
              Editing tools
            </h3>
            {toolButtons}
            <span className="chart__dockgap" aria-hidden="true" />
            {historyButtons}
          </div>
        </div>
        {announce}
      </section>
    );
  }

  // ---- wide layout: chart on the left, sidebar on the right ----------------------------------------------------
  return (
    <section ref={sectionRef} className="chart" aria-label="Your crochet chart">
      <div className="chart__layout">
        <div className="chart__left">
          <div className="chart__main">
            {modeToggle}
            {status}
            {chartBox}
          </div>
          <div className="chart__zoom chart__zoombar">
            {fitButton}
            {zoomControls}
          </div>
        </div>

        <div className="chart__side">
          <div className="chart__head">
            <h2 className="chart__title">Your chart</h2>
            <p className="chart__summary">{summary}</p>
          </div>
          <div className="chart__viewbar">
            {viewToggle}
            {gridCheck}
          </div>
          <div className="chart__tools" role="group" aria-labelledby={toolsId} hidden={tracking}>
            <h3 id={toolsId} className="chart__heading">
              Editing tools
            </h3>
            <div className="chart__toolgrid">{toolButtons}</div>
            <div className="chart__history" role="group" aria-label="History">
              {historyButtons}
            </div>
          </div>
          <div className="chart__colors">
            <h3 className="chart__heading" id={colorsId}>
              Yarn colors
            </h3>
            {palette}
            {colorEditor}
          </div>
          <div className="chart__downloads">
            <h3 className="chart__heading" id={downloadId}>
              Download
            </h3>
            <DownloadPanel
              onPng={exportPng}
              onPdf={exportPdf}
              busy={exporting}
              note={exportNote}
              choices={downloadChoices}
              onChoices={setDownloadChoices}
              tiledPages={tiledPageCount(matrix.cols, matrix.rows)}
              compactPages={tiledPageCount(matrix.cols, matrix.rows, COMPACT_PROFILE)}
                onBackup={onBackup}
            />
          </div>
          <div className="chart__edit">{utility}</div>
          <p className="chart__help" data-testid="chart-help">
            {helpFull}
          </p>
        </div>
      </div>
      {announce}
    </section>
  );
}
