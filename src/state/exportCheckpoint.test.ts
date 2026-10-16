import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../engine/convert/types";
import { paintStitches } from "../engine/editor/paint";
import { discardMessage, requestDiscard, shouldWarnOnLeave } from "./discardGuard";
import { afterExport, hasDownload, unsavedCount } from "./exportCheckpoint";
import type { ExportCheckpoint } from "./exportCheckpoint";

const pal = (hex: string) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex });
const converted: StitchMatrix = {
  cols: 20,
  rows: 20,
  palette: ["#ffffff", "#111111", "#c0392b"].map(pal),
  cells: Array.from({ length: 20 }, () => new Array<number>(20).fill(0)),
};
/** Paint `n` stitches along row `row`, starting at column `from`, with palette color `color`. */
const paint = (m: StitchMatrix, row: number, from: number, n: number, color: number): StitchMatrix =>
  paintStitches(m, Array.from({ length: n }, (_, i) => ({ col: from + i, row })), color).matrix;

describe("what counts as unsaved", () => {
  it("before any download, every stitch changed from the converted chart is unsaved (as in 4C)", () => {
    expect(unsavedCount(converted, converted, null)).toBe(0);
    expect(unsavedCount(paint(converted, 0, 0, 12, 1), converted, null)).toBe(12);
  });

  it("the example from the brief: edit 12, download, edit 5 more: only the 5 are unsaved", () => {
    const m12 = paint(converted, 0, 0, 12, 1);
    const cp = afterExport(null, converted, m12, true);
    expect(unsavedCount(m12, converted, cp)).toBe(0); // everything is in the file
    const m17 = paint(m12, 5, 0, 5, 2);
    expect(unsavedCount(m17, converted, cp)).toBe(5);
  });

  it("downloading does not switch the protection off for good: later edits count again, and again after a second download", () => {
    const a = paint(converted, 0, 0, 12, 1);
    const cp1 = afterExport(null, converted, a, true);
    const b = paint(a, 3, 0, 4, 2);
    expect(unsavedCount(b, converted, cp1)).toBe(4);
    const cp2 = afterExport(cp1, converted, b, true);
    expect(unsavedCount(b, converted, cp2)).toBe(0);
    const c = paint(b, 9, 0, 1, 1);
    expect(unsavedCount(c, converted, cp2)).toBe(1);
  });

  it("changing an already-downloaded stitch to something else counts as unsaved", () => {
    const a = paint(converted, 0, 0, 3, 1);
    const cp = afterExport(null, converted, a, true);
    const b = paint(a, 0, 0, 2, 2); // two of the downloaded stitches recoloured
    expect(unsavedCount(b, converted, cp)).toBe(2);
  });

  it("putting the chart back to the downloaded version, or back to the converted chart, leaves nothing at risk", () => {
    const a = paint(converted, 0, 0, 12, 1);
    const cp = afterExport(null, converted, a, true);
    const more = paint(a, 4, 0, 6, 2);
    expect(unsavedCount(more, converted, cp)).toBe(6);
    expect(unsavedCount(a, converted, cp)).toBe(0); // undo back to the download
    expect(unsavedCount(converted, converted, cp)).toBe(0); // Reset: the converted chart can always be rebuilt
  });

  it("a failed or cancelled download changes nothing: the old checkpoint stays, or there is none", () => {
    const a = paint(converted, 0, 0, 12, 1);
    expect(afterExport(null, converted, a, false)).toBeNull();
    expect(unsavedCount(a, converted, afterExport(null, converted, a, false))).toBe(12);
    const cp = afterExport(null, converted, a, true);
    const b = paint(a, 6, 0, 3, 2);
    expect(afterExport(cp, converted, b, false)).toBe(cp);
    expect(unsavedCount(b, converted, afterExport(cp, converted, b, false))).toBe(3);
  });

  it("edits made WHILE a file was being made are not marked as saved: the checkpoint is the chart when the export started", () => {
    const atStart = paint(converted, 0, 0, 12, 1);
    const whileExporting = paint(atStart, 7, 0, 5, 2); // painted after the export began
    const cp = afterExport(null, converted, atStart, true); // the snapshot, not the later chart
    expect(unsavedCount(whileExporting, converted, cp)).toBe(5);
    expect(unsavedCount(atStart, converted, cp)).toBe(0);
  });

  it("a download belongs to its own conversion: a new chart starts with nothing downloaded", () => {
    const a = paint(converted, 0, 0, 12, 1);
    const cp = afterExport(null, converted, a, true);
    const rebuilt: StitchMatrix = { ...converted, cells: converted.cells.map((r) => [...r]) }; // a new conversion (a new object)
    const edited = paint(rebuilt, 0, 0, 12, 1); // the very same 12 stitches, on the new chart: not in any file
    expect(hasDownload(rebuilt, cp)).toBe(false);
    expect(unsavedCount(edited, rebuilt, cp)).toBe(12);
    expect(hasDownload(converted, cp)).toBe(true);
    expect(hasDownload(converted, null)).toBe(false);
  });

  it("never changes the matrices it is given", () => {
    const a = Object.freeze(paint(converted, 0, 0, 3, 1));
    const cp: ExportCheckpoint = Object.freeze({ converted, snapshot: a });
    expect(() => unsavedCount(a, converted, cp)).not.toThrow();
  });
});

describe("the existing warnings still work after a download", () => {
  const a = paint(converted, 0, 0, 12, 1);
  const cp = afterExport(null, converted, a, true);

  it("right after a download there is nothing to warn about: a new chart or closing the tab goes straight through", () => {
    const n = unsavedCount(a, converted, cp);
    expect(requestDiscard(null, n, "Changing the size", () => {}).run).toBe(true);
    expect(shouldWarnOnLeave(n)).toBe(false);
  });

  it("new edits after the download bring the warning back, with only the new edits counted", () => {
    const n = unsavedCount(paint(a, 5, 0, 5, 2), converted, cp);
    expect(n).toBe(5);
    expect(requestDiscard(null, n, "Changing the size", () => {}).run).toBe(false);
    expect(shouldWarnOnLeave(n)).toBe(true);
    expect(discardMessage(n, "Changing the size", true).text).toBe(
      "Changing the size builds a new chart. Your 5 hand-edited stitches since your last download and your undo history will be discarded, and GridCrow can't get them back.",
    );
  });

  it("wording before any download is the same as in Stage 4C", () => {
    expect(discardMessage(1, "Building a new grid").text).toBe(
      "Building a new grid builds a new chart. Your 1 hand-edited stitch and your undo history will be discarded, and GridCrow can't get them back.",
    );
    expect(discardMessage(1, "Building a new grid", true).text).toContain("1 hand-edited stitch since your last download");
  });
});
