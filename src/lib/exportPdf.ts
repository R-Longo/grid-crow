import { buildPdf } from "../engine/export/pdf";
import type { PdfOptions } from "../engine/export/pdf";
import type { PatternModel } from "../engine/export/pattern";

/** Build the PDF file for the chart as it is now. Throws a plain-language Error when it cannot. */
export async function renderPatternPdf(model: PatternModel, options: PdfOptions): Promise<Blob> {
  await new Promise((resolve) => window.setTimeout(resolve, 0)); // let "Making your PDF…" show before the work starts
  try {
    const bytes = buildPdf(model, options);
    return new Blob([bytes as BlobPart], { type: "application/pdf" });
  } catch {
    throw new Error("This device ran out of memory making the PDF. Try Fit to one page.");
  }
}
