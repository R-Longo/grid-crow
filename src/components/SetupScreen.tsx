import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { COLOR_OPTIONS, DEFAULT_SETTINGS, ORIENTATION_OPTIONS, sizeOptions } from "../config/options";
import { DEFAULT_CROP, physicalAspect } from "../engine/convert/crop";
import { bitmapToRaster, decodeImageFile } from "../engine/convert/decode";
import type { DecodedImage } from "../engine/convert/decode";
import { convertInBackground } from "../engine/convert/run";
import { ConversionError } from "../engine/convert/types";
import type { CropState, StitchMatrix } from "../engine/convert/types";
import { BLANK_START_COLOR, makeBlankMatrix } from "../engine/blank";
import { buildGridSpec } from "../engine/geometry";
import { assessPicture, strengthenThinLines } from "../engine/strengthen/strengthen";
import { useDiscardGuard } from "../state/useDiscardGuard";
import { settingsReducer } from "../state/setupSettings";
import { strengthenActive, strengthenOffered } from "../state/strengthenChoice";
import type { SettingsAction } from "../state/setupSettings";
import type { SetupSettings } from "../types";
import { ChartView } from "./ChartView";
import { ConfirmDiscard } from "./ConfirmDiscard";
import { CropPreview } from "./CropPreview";
import { Icon } from "./Icon";
import { OptionGroup } from "./OptionGroup";
import { SizeSummary } from "./SizeSummary";
import { UploadZone } from "./UploadZone";

export function SetupScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [settings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS);
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    matrix: StitchMatrix;
    crop: CropState;
    aspect: number;
    blank: boolean;
  } | null>(null);
  // How this chart is started: from a picture, or from a blank grid.
  const [start, setStart] = useState<"image" | "scratch">("image");
  const [runError, setRunError] = useState<string | null>(null);
  const requestId = useRef(0);
  // How many stitches the person has hand-edited in the chart on screen (reported by the chart). While it is above zero,
  // anything that would replace the chart asks first, and closing the tab asks too.
  const [edited, setEdited] = useState(0);
  const [sinceDownload, setSinceDownload] = useState(false);
  // "Strengthen thin lines": ticked by the person; only has an effect on sizes where it is offered.
  const [strengthen, setStrengthen] = useState(false);
  const guard = useDiscardGuard(edited);
  // Once a chart is open the setup folds away into a one-line bar (on every screen size), so the chart gets the room.
  const [setupOpen, setSetupOpen] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  // Anything the chart depends on changing makes an old result stale, so it is cleared.
  const invalidate = useCallback(() => {
    requestId.current++;
    setResult(null);
    setRunError(null);
    setStatus("idle");
  }, []);

  const WHAT: Record<keyof SetupSettings, string> = {
    orientation: "Changing the orientation",
    sizeId: "Changing the size",
    maxColors: "Changing the maximum colors",
  };
  const update = <K extends keyof SetupSettings>(key: K, value: SetupSettings[K]) => {
    guard.request(WHAT[key], () => {
      invalidate();
      dispatch({ key, value } as SettingsAction);
    });
  };

  // One GridSpec, calculated from gauge, is derived from the current selections on every
  // render (never stored), so it cannot go stale. The converter uses this same object.
  const grid = useMemo(() => buildGridSpec(settings), [settings]);
  // Crop to the finished tapestry's PHYSICAL proportions (not stitches ÷ rows).
  const aspect = physicalAspect(grid.widthInches, grid.heightInches);
  const offerStrengthen = strengthenOffered(grid.cols);
  // A quick look at the picture: is it a drawing on light paper (where this helps most)? Worked out once per picture.
  const lineArt = useMemo(() => {
    if (!image) return null;
    try {
      return assessPicture(bitmapToRaster(image.bitmap)).lineArt;
    } catch {
      return null;
    }
  }, [image]);

  // Decode the chosen file in the browser; release it when replaced or removed.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    let decoded: DecodedImage | null = null;
    decodeImageFile(file)
      .then((d) => {
        if (cancelled) {
          d.close();
          return;
        }
        decoded = d;
        setImage(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setUploadError(e instanceof ConversionError ? e.message : "That image couldn't be opened.");
        setFile(null);
      });
    return () => {
      cancelled = true;
      decoded?.close();
      setImage(null);
    };
  }, [file]);

  const chooseFile = (f: File | null) => {
    guard.request(f ? "Changing the picture" : "Removing the picture", () => {
      invalidate();
      setUploadError(null);
      setCrop(DEFAULT_CROP);
      setFile(f);
    });
  };

  const create = async () => {
    if (!image) return;
    const id = ++requestId.current;
    setStatus("working");
    setResult(null);
    setRunError(null);
    try {
      let raster = bitmapToRaster(image.bitmap);
      if (strengthenActive(strengthen, grid.cols)) {
        // Widen the thin dark lines first; the converter itself is unchanged and just sees a different picture.
        await new Promise((resolve) => setTimeout(resolve, 0)); // let "Building your grid..." paint first
        raster = strengthenThinLines(raster, { cols: grid.cols, aspect }).raster;
      }
      const matrix = await convertInBackground(raster, crop, grid);
      if (id !== requestId.current) return; // settings changed while working
      setResult({ matrix, crop, aspect, blank: false });
      setStatus("done");
    } catch (e) {
      if (id !== requestId.current) return;
      setRunError(e instanceof ConversionError ? e.message : "Something went wrong while building your grid.");
      setStatus("error");
    }
  };

  // Start from Scratch: the same editor on an all-white grid of the chosen size.
  const openBlank = () => {
    requestId.current++;
    setRunError(null);
    setStatus("done");
    setResult({ matrix: makeBlankMatrix(grid.cols, grid.rows), crop: DEFAULT_CROP, aspect, blank: true });
  };

  const chooseStart = (next: "image" | "scratch") => {
    if (next === start) return;
    guard.request(next === "scratch" ? "Starting from scratch" : "Switching to a picture", () => {
      invalidate();
      setStart(next);
    });
  };
  const scratch = start === "scratch";

  // A new chart folds the setup away and brings the editor to the top of the screen; no chart, setup open.
  const hasResult = result !== null;
  // Show the setup bar and the editor under it; on a short screen (phone held sideways) the editor alone, since every pixel counts.
  const bringEditorIntoView = () => {
    const short = window.matchMedia("(max-height: 34rem)").matches;
    const target = short ? document.querySelector(".chart") : barRef.current;
    target?.scrollIntoView({ block: "start" });
  };
  useEffect(() => {
    if (!hasResult) {
      setSetupOpen(true);
      return;
    }
    setSetupOpen(false);
    const t = window.setTimeout(() => bringEditorIntoView(), 50);
    return () => window.clearTimeout(t);
  }, [result, hasResult]);
  const folded = hasResult && !setupOpen;
  const toggleSetup = () => {
    setSetupOpen((o) => !o);
    window.setTimeout(() => bringEditorIntoView(), 50);
  };

  return (
    <main>
      <div hidden={folded} className="setup__body">
        <fieldset className="start">
          <legend>How do you want to begin?</legend>
          <div className="start__cards">
            {(
              [
                { id: "image", title: "Convert an Image", icon: "image" },
                { id: "scratch", title: "Draw from Scratch", icon: "pencil" },
              ] as const
            ).map((c) => (
              <label className="start__card" key={c.id}>
                <input
                  type="radio"
                  name="start"
                  value={c.id}
                  data-testid={`start-${c.id}`}
                  checked={start === c.id}
                  onChange={() => chooseStart(c.id)}
                />
                <Icon name={c.icon} size={20} />
                <span className="start__title">{c.title}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {!scratch && (
          <UploadZone
            file={file}
            onFileChange={chooseFile}
            externalError={uploadError}
            preview={
              image ? (
                <CropPreview
                  image={image}
                  aspect={aspect}
                  crop={crop}
                  onChange={(c) => {
                    guard.request("Changing the crop", () => {
                      invalidate();
                      setCrop(c);
                    });
                  }}
                />
              ) : (
                <p className="preview__meta" role="status">
                  Opening your picture…
                </p>
              )
            }
          />
        )}

        <div className="fields">
          <OptionGroup
            legend="Orientation"
            options={ORIENTATION_OPTIONS}
            value={settings.orientation}
            onChange={(v) => update("orientation", v)}
          />

          <div>
            <OptionGroup
              legend="Finished tapestry size"
              options={sizeOptions(settings.orientation)}
              value={settings.sizeId}
              onChange={(v) => update("sizeId", v)}
              columns={2}
            />
            <SizeSummary grid={grid} />
          </div>

          {!scratch && offerStrengthen && (
            <fieldset className="strengthen">
              <legend className="visually-hidden">Thin lines</legend>
              <label className="strengthen__row">
                <span className="strengthen__icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 40 40"
                    width="34"
                    height="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 30 22 12l5 4L12 34l-6 1z" />
                    <path d="M19.5 15l5 4" />
                    <path d="M6 38h14" />
                    <path
                      className="strengthen__spark"
                      d="M31 6l1.6 3.4L36 11l-3.4 1.6L31 16l-1.6-3.4L26 11l3.4-1.6z"
                    />
                    <path className="strengthen__spark" d="M32 22l1 2.2 2.2 1-2.2 1L32 28.4l-1-2.2-2.2-1 2.2-1z" />
                  </svg>
                </span>
                <span className="strengthen__text">
                  <span className="strengthen__title">Strengthen Lines</span>
                  <span className="strengthen__sub">For drawings with thin outlines</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="strengthen__switch"
                  data-testid="strengthen"
                  checked={strengthen}
                  onChange={(e) => {
                    const next = e.target.checked;
                    guard.request("Changing thin-line strengthening", () => {
                      invalidate();
                      setStrengthen(next);
                    });
                  }}
                />
              </label>
              <p className="strengthen__help" data-testid="strengthen-help">
                Makes thin, dark lines bolder so they don't fade away in your stitch chart. Best for pen and line
                drawings.
                {lineArt === false &&
                  " This picture is colorful or has a dark background, so check the chart and turn this off if it looks worse."}
              </p>
            </fieldset>
          )}

          {!scratch && (
            <OptionGroup
              legend="Maximum yarn colors"
              options={COLOR_OPTIONS}
              value={settings.maxColors}
              onChange={(v) => update("maxColors", v)}
              lead={<Icon name="palette" size={24} />}
            />
          )}
        </div>

        <div className="cta">
          {scratch ? (
            <button
              type="button"
              className="btn btn--primary"
              data-testid="open-blank"
              onClick={() => guard.request("Starting a new canvas", openBlank)}
            >
              Open Blank Canvas
              <Icon name="arrow" size={20} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!image || status === "working"}
                onClick={() => guard.request("Building a new grid", create)}
              >
                {status === "working" ? "Building your grid…" : "Create My Crochet Grid"}
                <Icon name="arrow" size={20} />
              </button>
              {!file && <p className="cta-hint">Add a picture to continue.</p>}
            </>
          )}

          {status === "error" && runError && (
            <p className="upload__error" role="alert">
              {runError}
            </p>
          )}
          <p className="made-for">Free to use. Made for crocheters. ♡</p>
        </div>
      </div>

      {result && (
        <div ref={barRef} className="setupbar" data-testid="setup-bar">
          <span className="setupbar__text">
            {result.blank ? "Blank canvas" : "Your picture"} · {grid.widthInches} × {grid.heightInches} in
          </span>
          <button
            type="button"
            className="setupbar__btn"
            data-testid="setup-change"
            aria-expanded={!folded}
            onClick={toggleSetup}
          >
            {folded ? "Change" : "Hide"}
          </button>
        </div>
      )}

      {result && (
        <ChartView
          matrix={result.matrix}
          image={image}
          crop={result.crop}
          aspect={result.aspect}
          blank={result.blank}
          startColor={result.blank ? BLANK_START_COLOR : 0}
          onEditedChange={(n, afterDownload) => {
            setEdited(n);
            setSinceDownload(afterDownload);
          }}
        />
      )}

      {guard.pending && (
        <ConfirmDiscard
          changed={edited}
          sinceDownload={sinceDownload}
          what={guard.pending.what}
          onConfirm={guard.confirm}
          onCancel={guard.cancel}
        />
      )}
    </main>
  );
}
