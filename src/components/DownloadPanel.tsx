import { useId } from "react";
import type { PdfLayoutKind } from "../engine/export/pdf";
import { Icon } from "./Icon";

export interface DownloadNote {
  kind: "ok" | "error";
  text: string;
}

export interface DownloadChoices {
  pngLetters: boolean;
  pdfLayout: PdfLayoutKind;
  pdfLetters: boolean;
}

interface DownloadPanelProps {
  onPng: () => void;
  onPdf: () => void;
  /** Which export is being prepared right now, if any. */
  busy: "png" | "pdf" | null;
  note: DownloadNote | null;
  choices: DownloadChoices;
  onChoices: (next: DownloadChoices) => void;
  /** Pages Large Print would make for this chart (the overview plus the chart pages). */
  tiledPages: number;
  /** Pages Compact makes for this chart (overview + chart pages). */
  compactPages: number;
  /** Saves the whole project (chart, settings, progress, picture) as a `.gridcrow` backup file. */
  onBackup?: () => void;
}

/**
 * Download buttons. The PNG is the everyday export: follow it on a phone, tablet or laptop and zoom in as far as you like.
 * The PDF is the flexible one, to read on screen or print. Only when "Large print" is chosen does the printing help appear.
 * Shown in the sidebar on wide screens and in the "Download" panel on phones.
 */
export function DownloadPanel({ onPng, onPdf, busy, note, choices, onChoices, tiledPages, compactPages, onBackup }: DownloadPanelProps) {
  const uid = useId();
  const tiled = choices.pdfLayout === "tiled";
  const compact = choices.pdfLayout === "compact";
  return (
    <div className="download" data-testid="download-panel">
      <p className="download__text">Save your finished chart as a sharp picture you can zoom in on, with a color key and stitch counts.</p>
      <button type="button" className="chart__small download__btn download__btn--png" data-testid="download-png" disabled={busy !== null} onClick={onPng}>
        <Icon name="download" size={18} />
        {busy === "png" ? "Making your PNG…" : "Download PNG"}
      </button>
      <label className="download__check">
        <input type="checkbox" data-testid="png-letters" checked={choices.pngLetters} onChange={(e) => onChoices({ ...choices, pngLetters: e.target.checked })} />
        <span>Add color letters inside the stitches</span>
      </label>

      <fieldset className="download__pdf">
        <legend className="download__legend">PDF, to read or print</legend>
        <label className="download__check">
          <input type="radio" name={`${uid}-layout`} data-testid="pdf-fit" checked={!tiled && !compact} onChange={() => onChoices({ ...choices, pdfLayout: "fit" })} />
          <span>Fit to one page</span>
        </label>
        <label className="download__check">
          <input type="radio" name={`${uid}-layout`} data-testid="pdf-tiled" checked={tiled} onChange={() => onChoices({ ...choices, pdfLayout: "tiled" })} />
          <span>Large print, tiled pages</span>
        </label>
        <label className="download__check">
          <input type="radio" name={`${uid}-layout`} data-testid="pdf-compact" checked={compact} onChange={() => onChoices({ ...choices, pdfLayout: "compact" })} />
          <span>Compact, fewer pages</span>
        </label>
        {compact && (
          <p className="download__text download__tiled" data-testid="pdf-compact-help">
            {compactPages === 2
              ? "Your chart fits on one page, plus an overview page. Stitches are printed smaller than the finished piece. Print at 100% (Actual size)."
              : `${compactPages} pages: an overview, then ${compactPages - 1} chart pages that join along bold lines. Stitches are printed smaller than the finished piece (about three quarters of Large print). Print at 100% (Actual size).`}
          </p>
        )}
        {tiled && (
          <p className="download__text download__tiled" data-testid="pdf-tiled-help">
            {tiledPages === 2
              ? "Your chart fits on one large page, plus an overview page. Print at 100% (Actual size)."
              : `${tiledPages} pages: an overview, then ${tiledPages - 1} chart pages that join along bold lines. Print at 100% (Actual size); the overview page shows how to assemble them.`}
          </p>
        )}
        <label className="download__check">
          <input type="checkbox" data-testid="pdf-letters" checked={choices.pdfLetters} onChange={(e) => onChoices({ ...choices, pdfLetters: e.target.checked })} />
          <span>Color letters inside the stitches</span>
        </label>
        <button type="button" className="chart__small download__btn download__btn--pdf" data-testid="download-pdf" disabled={busy !== null} onClick={onPdf}>
          <Icon name="download" size={18} />
          {busy === "pdf" ? "Making your PDF…" : "Download PDF"}
        </button>
      </fieldset>

      {onBackup && (
        <div className="download__backup">
          <p className="download__text">Your project saves on this device by itself. A backup file lets you move it to another device or keep a safe copy.</p>
          <button type="button" className="chart__small download__btn" data-testid="download-backup" onClick={onBackup}>
            <Icon name="download" size={18} />
            Save backup file (.gridcrow)
          </button>
        </div>
      )}

      <p
        className={`download__note${note?.kind === "error" ? " download__note--error" : ""}`}
        data-testid="download-note"
        role={note?.kind === "error" ? "alert" : "status"}
      >
        {note?.text ?? ""}
      </p>
    </div>
  );
}
