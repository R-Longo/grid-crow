import { COLOR_OPTIONS } from "../../config/options";
import { FINISHED_SIZES } from "../../config/sizes";
import type { SetupSettings } from "../../types";
import { buildGridSpec } from "../geometry";
import type { CropState, PaletteColor, StitchMatrix } from "../convert/types";
import { MAX_PALETTE } from "../editor/recolor";
import { GAUGE_LIMITS, MAX_CHART_SIDE, validGauge } from "../gauge";

/**
 * A saved GridCrow project. The stitch matrix is the one source of truth, so a project is mostly two matrices:
 * the converted chart (what Reset goes back to) and the chart as edited so far. The original picture is kept only so the
 * Original view keeps working. Undo history is not saved.
 *
 * The same shape is used in the browser's own storage and in the .gridcrow backup file, so what is validated on import is
 * exactly what is stored.
 */
export const PROJECT_FORMAT = "gridcrow-project";
export const PROJECT_VERSION = 1;
export const MAX_PROJECT_NAME = 80;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export interface PackedMatrix {
  cols: number;
  rows: number;
  /** "#rrggbb", lower case. */
  palette: string[];
  /** cols * rows palette indices, row by row from the top (the same order as StitchMatrix.cells). */
  cells: Uint8Array;
  /** The person's own gauge, when the chart has one. */
  gauge?: { stitchesPerInch: number; rowsPerInch: number };
}

export interface ProjectData {
  id: string;
  name: string;
  kind: "picture" | "blank";
  createdAt: number;
  updatedAt: number;
  settings: SetupSettings;
  strengthen: boolean;
  crop: CropState;
  aspect: number;
  converted: PackedMatrix;
  current: PackedMatrix;
  /** Stitches crocheted so far, in working order (row 1 first, stitch 1 first), 0 to cols * rows. */
  progress: number;
  image: { name: string; type: string; bytes: Uint8Array } | null;
}

export class ProjectFormatError extends Error {}

// ---------- matrices ----------

export function packMatrix(m: StitchMatrix): PackedMatrix {
  const cells = new Uint8Array(m.cols * m.rows);
  for (let r = 0; r < m.rows; r++) cells.set(m.cells[r], r * m.cols);
  const packed: PackedMatrix = { cols: m.cols, rows: m.rows, palette: m.palette.map((p) => p.hex.toLowerCase()), cells };
  return m.gauge ? { ...packed, gauge: m.gauge } : packed;
}

function colorOf(hex: string): PaletteColor {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, hex };
}

export function unpackMatrix(p: PackedMatrix): StitchMatrix {
  const cells: number[][] = [];
  for (let r = 0; r < p.rows; r++) cells.push(Array.from(p.cells.subarray(r * p.cols, (r + 1) * p.cols)));
  const m: StitchMatrix = { cols: p.cols, rows: p.rows, palette: p.palette.map(colorOf), cells };
  return p.gauge ? { ...m, gauge: p.gauge } : m;
}

// ---------- base64 ----------

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  if (typeof text !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new ProjectFormatError("The file has damaged data in it.");
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- file ----------

export function projectToJson(p: ProjectData): string {
  const matrix = (m: PackedMatrix) => ({ cols: m.cols, rows: m.rows, palette: m.palette, cells: toBase64(m.cells), ...(m.gauge ? { gauge: m.gauge } : {}) });
  return JSON.stringify({
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: p.name,
    kind: p.kind,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    settings: p.settings,
    strengthen: p.strengthen,
    crop: p.crop,
    aspect: p.aspect,
    progress: p.progress,
    converted: matrix(p.converted),
    current: matrix(p.current),
    image: p.image ? { name: p.image.name, type: p.image.type, data: toBase64(p.image.bytes) } : null,
  });
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
function num(x: unknown, lo: number, hi: number, what: string): number {
  if (typeof x !== "number" || !Number.isFinite(x) || x < lo || x > hi) throw new ProjectFormatError(`The file's ${what} is not valid.`);
  return x;
}

/** Make a project name safe and short: no control characters, trimmed, never empty. */
export function cleanName(x: unknown, fallback = "Untitled project"): string {
  const s = typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  return (s || fallback).slice(0, MAX_PROJECT_NAME);
}

function parseMatrix(x: unknown, cols: number, rows: number, what: string): PackedMatrix {
  if (!isObj(x)) throw new ProjectFormatError(`The file's ${what} is missing.`);
  if (x.cols !== cols || x.rows !== rows) throw new ProjectFormatError(`The file's ${what} does not match its size.`);
  const pal = x.palette;
  if (!Array.isArray(pal) || pal.length < 1 || pal.length > MAX_PALETTE) throw new ProjectFormatError(`The file's ${what} colors are not valid.`);
  const palette = pal.map((h) => {
    if (typeof h !== "string" || !/^#[0-9a-fA-F]{6}$/.test(h)) throw new ProjectFormatError(`The file's ${what} colors are not valid.`);
    return h.toLowerCase();
  });
  if (new Set(palette).size !== palette.length) throw new ProjectFormatError(`The file's ${what} repeats a color.`);
  const cells = fromBase64(x.cells as string);
  if (cells.length !== cols * rows) throw new ProjectFormatError(`The file's ${what} stitches do not match its size.`);
  for (let i = 0; i < cells.length; i++) if (cells[i] >= palette.length) throw new ProjectFormatError(`The file's ${what} stitches use a color that does not exist.`);
  let gauge: PackedMatrix["gauge"];
  if (x.gauge !== undefined) {
    const g = x.gauge;
    if (!isObj(g) || !validGauge(g)) throw new ProjectFormatError(`The file's ${what} gauge is not valid.`);
    gauge = { stitchesPerInch: g.stitchesPerInch as number, rowsPerInch: g.rowsPerInch as number };
  }
  return gauge ? { cols, rows, palette, cells, gauge } : { cols, rows, palette, cells };
}

/** Read and check a .gridcrow file's text. Never trusts it: every field is range-checked and rebuilt. */
export function parseProjectJson(text: string, id: string): ProjectData {
  if (typeof text !== "string" || text.length > MAX_FILE_BYTES * 1.4) throw new ProjectFormatError("That file is too large to be a GridCrow project.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFormatError("That isn't a GridCrow project file.");
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) throw new ProjectFormatError("That isn't a GridCrow project file.");
  if (raw.version !== PROJECT_VERSION) throw new ProjectFormatError("That project was saved by a different version of GridCrow and can't be opened here.");
  if (raw.kind !== "picture" && raw.kind !== "blank") throw new ProjectFormatError("The file's kind is not valid.");
  const s = raw.settings;
  if (!isObj(s) || (s.orientation !== "portrait" && s.orientation !== "landscape")) throw new ProjectFormatError("The file's size settings are not valid.");
  const maxColors = COLOR_OPTIONS.find((c) => c.value === s.maxColors)?.value;
  let settings: SetupSettings;
  if (s.sizeId === "custom") {
    const c = s.custom;
    if (!maxColors || !isObj(c)) throw new ProjectFormatError("The file's size settings are not valid.");
    const custom = {
      widthInches: num(c.widthInches, 0.5, 400, "width"),
      heightInches: num(c.heightInches, 0.5, 400, "height"),
      stitchesPerInch: num(c.stitchesPerInch, GAUGE_LIMITS.stitchesPerInch.min, GAUGE_LIMITS.stitchesPerInch.max, "gauge"),
      rowsPerInch: num(c.rowsPerInch, GAUGE_LIMITS.rowsPerInch.min, GAUGE_LIMITS.rowsPerInch.max, "gauge"),
    };
    settings = { orientation: s.orientation, sizeId: "custom", maxColors, custom };
  } else {
    const sizeId = FINISHED_SIZES.find((z) => z.id === s.sizeId)?.id;
    if (!sizeId || !maxColors) throw new ProjectFormatError("The file's size settings are not valid.");
    settings = { orientation: s.orientation, sizeId, maxColors };
  }
  const grid = buildGridSpec(settings);
  if (grid.cols > MAX_CHART_SIDE || grid.rows > MAX_CHART_SIDE) throw new ProjectFormatError("The file's chart is bigger than GridCrow supports.");
  const converted = parseMatrix(raw.converted, grid.cols, grid.rows, "chart");
  const current = parseMatrix(raw.current, grid.cols, grid.rows, "edited chart");
  const crop = raw.crop;
  if (!isObj(crop)) throw new ProjectFormatError("The file's crop is not valid.");
  const cropOk: CropState = { zoom: num(crop.zoom, 1, 4, "crop"), cx: num(crop.cx, 0, 1, "crop"), cy: num(crop.cy, 0, 1, "crop") };
  let image: ProjectData["image"] = null;
  if (raw.image !== null && raw.image !== undefined) {
    const im = raw.image;
    if (!isObj(im) || typeof im.type !== "string" || !IMAGE_TYPES.includes(im.type)) throw new ProjectFormatError("The file's picture is not valid.");
    const bytes = fromBase64(im.data as string);
    if (bytes.length > MAX_IMAGE_BYTES) throw new ProjectFormatError("The file's picture is too large.");
    image = { name: cleanName(im.name, "picture").slice(0, 120), type: im.type, bytes };
  }
  if (raw.kind === "picture" && !image) {
    // A picture project without its picture still opens: the chart works, only the Original view is missing.
  }
  const now = Date.now();
  return {
    id,
    name: cleanName(raw.name),
    kind: raw.kind,
    createdAt: typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: now,
    settings,
    strengthen: raw.strengthen === true,
    crop: cropOk,
    aspect: num(raw.aspect, 0.1, 10, "proportions"),
    converted,
    current,
    progress: Math.floor(num(raw.progress ?? 0, 0, grid.cols * grid.rows, "progress")),
    image,
  };
}

/** A safe file name for the backup: letters, digits, dashes. */
export function backupFileName(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "project";
  return `gridcrow-${base}.gridcrow`;
}
