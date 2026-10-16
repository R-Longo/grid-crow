import type { PatternModel } from "../pattern";
import { layoutFit } from "./fit";
import type { PdfDoc } from "./ops";
import { layoutTiled } from "./tiled";
import { writePdf } from "./writer";

export type PdfLayoutKind = "fit" | "tiled";

export interface PdfOptions {
  layout: PdfLayoutKind;
  /** Print each stitch's color letter inside it. On by default for the PDF. */
  letters: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = { layout: "fit", letters: true };

/** The pages of the PDF, as drawing instructions (tests read these). */
export function buildPdfDoc(model: PatternModel, options: PdfOptions = DEFAULT_PDF_OPTIONS): PdfDoc {
  const pages = options.layout === "tiled" ? layoutTiled(model, options) : layoutFit(model, options);
  return { title: `GridCrow crochet chart ${model.cols} x ${model.rows}`, pages };
}

/** The bytes of the PDF file. Pure: the same chart and options always give the same bytes. */
export function buildPdf(model: PatternModel, options: PdfOptions = DEFAULT_PDF_OPTIONS): Uint8Array {
  return writePdf(buildPdfDoc(model, options));
}
