import { drawPng, layoutPng } from "../engine/export/png";
import type { PngOptions } from "../engine/export/png";
import type { PatternModel } from "../engine/export/pattern";

/** Draw the pattern on an off-screen canvas and return it as a PNG file. Throws a plain-language Error when the device cannot. */
export async function renderPatternPng(model: PatternModel, options: PngOptions = {}): Promise<Blob> {
  const layout = layoutPng(model, options);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device could not create the picture.");
  drawPng(ctx, model, layout);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  canvas.width = 0; // let the device free the memory straight away
  canvas.height = 0;
  if (!blob) throw new Error("This device ran out of memory making the picture.");
  return blob;
}

/** Hand a file to the browser as a download. Returns true when the browser was given the file. */
export function downloadBlob(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  } catch {
    return false;
  }
}
