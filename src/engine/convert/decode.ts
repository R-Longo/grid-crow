import { ACCEPTED_IMAGE_TYPES } from "../../config/options";
import { ConversionError } from "./types";
import type { Raster } from "./types";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;
/** Pictures larger than this are scaled down on load; more detail than this can't show in a chart. */
export const MAX_SOURCE_SIDE = 2048;

/** What the file's first bytes say it is, regardless of its name or declared type. */
export function sniffImageType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** Throws a ConversionError with a user-readable message when the file can't be an acceptable image. */
export function checkImageFile(declaredType: string, size: number, head: Uint8Array): void {
  if (size === 0) throw new ConversionError("empty-file", "That file is empty. Please choose a different image.");
  if (!ACCEPTED_IMAGE_TYPES.includes(declaredType)) {
    throw new ConversionError("unsupported-type", "That file type isn't supported. Please choose a JPG, PNG, or WebP image.");
  }
  if (size > MAX_FILE_BYTES) {
    throw new ConversionError("too-large", "That image is too large. Please choose one under 30 MB.");
  }
  const sniffed = sniffImageType(head);
  if (!sniffed) {
    throw new ConversionError("corrupt-image", "That file doesn't look like a valid JPG, PNG, or WebP image.");
  }
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Release the decoded picture's memory. */
  close: () => void;
}

/** Validate and decode an uploaded file, entirely in the browser. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  checkImageFile(file.type, file.size, head);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ConversionError("corrupt-image", "That image couldn't be opened. It may be damaged. Please try another file.");
  }
  if (bitmap.width < 1 || bitmap.height < 1) {
    bitmap.close();
    throw new ConversionError("corrupt-image", "That image couldn't be opened. Please try another file.");
  }
  return { bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

/** Read the pixels (scaled so neither side exceeds MAX_SOURCE_SIDE). Transparency is kept for the engine to flatten. */
export function bitmapToRaster(bitmap: ImageBitmap, maxSide = MAX_SOURCE_SIDE): Raster {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new ConversionError("corrupt-image", "Your browser couldn't process that image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  canvas.width = canvas.height = 0; // release the temporary canvas
  return { width: w, height: h, data: img.data };
}
