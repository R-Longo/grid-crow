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
}

/**
 * Download buttons. The PNG is the everyday export: follow it on a phone, tablet or laptop and zoom in as far as you like.
 * The PDF is the flexible one, to read on screen or print. Only when "Large print" is chosen does the printing help appear.
 * Shown in the sidebar on wide screens and in the "Download" panel on phones.
 */
export function DownloadPanel({ onPng, onPdf, busy, note, choices, onChoices, tiledPages }: DownloadPanelProps) {
  const uid = useId();
  const tiled = choices.pdfLayout === "tiled";
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
          <input type="radio" name={`${uid}-layout`} data-testid="pdf-fit" checked={!tiled} onChange={() => onChoices({ ...choices, pdfLayout: "fit" })} />
          <span>Fit to one page</span>
        </label>
        <label className="download__check">
          <input type="radio" name={`${uid}-layout`} data-testid="pdf-tiled" checked={tiled} onChange={() => onChoices({ ...choices, pdfLayout: "tiled" })} />
          <span>Large print, tiled pages</span>
        </label>
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
