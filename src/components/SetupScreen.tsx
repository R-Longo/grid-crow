import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { COLOR_OPTIONS, DEFAULT_SETTINGS, ORIENTATION_OPTIONS, sizeOptions } from "../config/options";
import { DEFAULT_CROP, physicalAspect } from "../engine/convert/crop";
import { bitmapToRaster, decodeImageFile } from "../engine/convert/decode";
import type { DecodedImage } from "../engine/convert/decode";
import { convertInBackground } from "../engine/convert/run";
import { ConversionError } from "../engine/convert/types";
import type { CropState, StitchMatrix } from "../engine/convert/types";
import { buildGridSpec } from "../engine/geometry";
import { useDiscardGuard } from "../state/useDiscardGuard";
import { settingsReducer } from "../state/setupSettings";
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
  const [result, setResult] = useState<{ matrix: StitchMatrix; crop: CropState; aspect: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const requestId = useRef(0);
  // How many stitches the person has hand-edited in the chart on screen (reported by the chart). While it is above zero,
  // anything that would replace the chart asks first, and closing the tab asks too.
  const [edited, setEdited] = useState(0);
  const guard = useDiscardGuard(edited);

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
      const raster = bitmapToRaster(image.bitmap);
      const matrix = await convertInBackground(raster, crop, grid);
      if (id !== requestId.current) return; // settings changed while working
      setResult({ matrix, crop, aspect });
      setStatus("done");
    } catch (e) {
      if (id !== requestId.current) return;
      setRunError(e instanceof ConversionError ? e.message : "Something went wrong while building your grid.");
      setStatus("error");
    }
  };

  return (
    <main>
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

        <OptionGroup
          legend="Maximum yarn colors"
          options={COLOR_OPTIONS}
          value={settings.maxColors}
          onChange={(v) => update("maxColors", v)}
          lead={<Icon name="palette" size={24} />}
        />
      </div>

      <div className="cta">
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

        {status === "error" && runError && (
          <p className="upload__error" role="alert">
            {runError}
          </p>
        )}
        <p className="made-for">Free to use. Made for crocheters. ♡</p>
      </div>

      {result && (
        <ChartView
          matrix={result.matrix}
          image={image}
          crop={result.crop}
          aspect={result.aspect}
          onEditedChange={setEdited}
        />
      )}

      {guard.pending && (
        <ConfirmDiscard
          changed={edited}
          what={guard.pending.what}
          onConfirm={guard.confirm}
          onCancel={guard.cancel}
        />
      )}
    </main>
  );
}
