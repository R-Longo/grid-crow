import type { StitchMatrix } from "../engine/convert/types";
import { countDifferences } from "../engine/editor/paint";

/**
 * "Saved" for GridCrow means "downloaded". There is no project saving, so the only copies of an edited chart that live
 * outside the page are the PNG and PDF files the person has downloaded. This file is the decision logic only (no React,
 * no DOM) for how many edited stitches are still at risk.
 *
 * The checkpoint is the chart exactly as it was when the last download was prepared. It is a snapshot taken when the
 * export STARTS, so anything painted while the file was being made stays unsaved.
 */
export interface ExportCheckpoint {
  /** The conversion this checkpoint belongs to; a new conversion starts with no checkpoint. */
  converted: StitchMatrix;
  /** The chart as it was when the export started. Matrices are never changed in place, so a reference is a true snapshot. */
  snapshot: StitchMatrix;
}

/**
 * How many stitches would be lost if the chart were replaced right now: those that differ from BOTH the converted chart
 * (which can always be rebuilt from the picture) and the last downloaded version (which is in the person's files).
 * Before any download that is simply the stitches changed from the converted chart.
 */
export function unsavedCount(matrix: StitchMatrix, converted: StitchMatrix, checkpoint: ExportCheckpoint | null): number {
  const fromConverted = countDifferences(matrix, converted);
  if (!checkpoint || checkpoint.converted !== converted) return fromConverted;
  return Math.min(fromConverted, countDifferences(matrix, checkpoint.snapshot));
}

/** Is there a download to compare against for this conversion? (Decides the wording: "since your last download".) */
export function hasDownload(converted: StitchMatrix, checkpoint: ExportCheckpoint | null): boolean {
  return checkpoint !== null && checkpoint.converted === converted;
}

/**
 * What the checkpoint becomes when an export ends. Only a download the browser accepted moves it, and it moves to the
 * chart that was exported (the snapshot from the start), never to whatever the chart looks like by the time it finished.
 */
export function afterExport(
  current: ExportCheckpoint | null,
  converted: StitchMatrix,
  snapshot: StitchMatrix,
  downloadStarted: boolean,
): ExportCheckpoint | null {
  return downloadStarted ? { converted, snapshot } : current;
}
