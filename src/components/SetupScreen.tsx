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
import type { FinishedSizeId, SetupSettings } from "../types";
import {
  MAX_FILE_BYTES,
  ProjectFormatError,
  backupFileName,
  cleanName,
  packMatrix,
  parseProjectJson,
  projectToJson,
  unpackMatrix,
} from "../engine/project/format";
import type { ProjectData } from "../engine/project/format";
import { deleteProject, getProject, listProjects, renameProject, requestKeepStorage, saveProject } from "../lib/projectStore";
import type { ProjectSummary } from "../lib/projectStore";
import { ChartView } from "./ChartView";
import { ProjectsPanel } from "./ProjectsPanel";
import { ConfirmDiscard } from "./ConfirmDiscard";
import { CropPreview } from "./CropPreview";
import { Icon } from "./Icon";
import { OptionGroup } from "./OptionGroup";
import { SizeSummary } from "./SizeSummary";
import { ManualMode } from "./ManualMode";
import { ModeChoice } from "./ModeChoice";
import type { SetupMode } from "./ModeChoice";
import { EMPTY_MANUAL, parseManual, rawFromCustom } from "../engine/manual";
import type { ManualRaw } from "../engine/manual";
import { UploadZone } from "./UploadZone";

const GAUGE_KEY = "gridcrow-swatch";
/** The last swatch the person typed, remembered on this device so a sweater maker does not retype it for every project. */
function loadSwatch(): ManualRaw {
  try {
    const t = JSON.parse(localStorage.getItem(GAUGE_KEY) ?? "null");
    if (t && typeof t === "object") {
      const s = (k: string) => (typeof t[k] === "string" ? (t[k] as string).slice(0, 12) : "");
      return { ...EMPTY_MANUAL, sw: s("sw"), swIn: s("swIn"), sh: s("sh"), shIn: s("shIn") };
    }
  } catch {
    /* no storage: start empty */
  }
  return EMPTY_MANUAL;
}

export function SetupScreen() {
  const [file, setFile] = useState<File | null>(null);
  const [presetSettings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS);
  // Quick Start picks a preset size. Manual Mode types a gauge and a size, which is worked into a custom size here.
  const [mode, setMode] = useState<SetupMode>("quick");
  const [manualRaw, setManualRaw] = useState<ManualRaw>(loadSwatch);
  const manual = useMemo(() => parseManual(manualRaw), [manualRaw]);
  const manualReady = mode === "manual" && manual.custom !== null;
  const settings: SetupSettings = useMemo(
    () => (mode === "manual" && manual.custom ? { ...presetSettings, sizeId: "custom", custom: manual.custom } : presetSettings),
    [mode, manual.custom, presetSettings],
  );
  const [image, setImage] = useState<DecodedImage | null>(null);
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<{
    matrix: StitchMatrix;
    crop: CropState;
    aspect: number;
    blank: boolean;
    /** A saved, hand-edited version of the chart (only when a project was opened). */
    current?: StitchMatrix;
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
  // Projects save themselves on this device. "saved" means the chart on screen is safely stored, so nothing is at risk.
  const [saveState, setSaveState] = useState<"none" | "unsaved" | "saving" | "saved" | "error">("none");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const guard = useDiscardGuard(saveState === "saved" ? 0 : edited);
  // Once a chart is open the setup folds away into a one-line bar (on every screen size), so the chart gets the room.
  const [setupOpen, setSetupOpen] = useState(true);
  const barRef = useRef<HTMLDivElement>(null);

  // ---- Saving ----
  type Base = Omit<ProjectData, "current" | "updatedAt" | "progress" | "image">;
  const projectRef = useRef<{ base: Base; imagePromise: Promise<ProjectData["image"]>; imageWritten: boolean } | null>(null);
  const matrixRef = useRef<StitchMatrix | null>(null);
  const savedMatrixRef = useRef<StitchMatrix | null>(null);
  const progressRef = useRef(0);
  const [progress, setProgressState] = useState(0);
  const changeProgress = useCallback(
    (n: number) => {
      progressRef.current = n;
      setProgressState(n);
      scheduleSaveRef.current();
    },
    [],
  );
  const scheduleSaveRef = useRef<() => void>(() => {});
  const resultRef = useRef<typeof result>(null);
  const versionRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const refreshProjects = useCallback(() => {
    listProjects()
      .then((l) => {
        setProjects(l);
        setStorageOk(true);
      })
      .catch(() => setStorageOk(false));
  }, []);
  useEffect(() => refreshProjects(), [refreshProjects]);

  const writeNow = useCallback(() => {
    const p = projectRef.current;
    const m = matrixRef.current;
    if (!p || !m) return Promise.resolve();
    const version = versionRef.current;
    setSaveState("saving");
    chainRef.current = chainRef.current.then(async () => {
      try {
        const withImage = !p.imageWritten;
        const image = withImage ? await p.imagePromise : null;
        await saveProject(
          { ...p.base, current: packMatrix(m), updatedAt: Date.now(), progress: progressRef.current, image },
          { withImage },
        );
        p.imageWritten = true;
        void requestKeepStorage();
        if (projectRef.current === p) setSaveState(version === versionRef.current ? "saved" : "unsaved");
        refreshProjects();
      } catch {
        if (projectRef.current === p) setSaveState("error");
      }
    });
    return chainRef.current;
  }, [refreshProjects]);

  const scheduleSave = useCallback(() => {
    if (!projectRef.current) return;
    versionRef.current++;
    setSaveState("unsaved");
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void writeNow(), 1200);
  }, [writeNow]);

  scheduleSaveRef.current = scheduleSave;

  // Leaving the page (or the app going to the background) saves right away instead of waiting.
  useEffect(() => {
    const flush = () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
        void writeNow();
      }
    };
    const onVis = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", flush);
    };
  }, [writeNow]);

  const beginProject = (res: NonNullable<typeof result>, f: File | null) => {
    const now = Date.now();
    const id = crypto.randomUUID();
    projectRef.current = {
      base: {
        id,
        name: res.blank ? "Blank canvas" : cleanName(f?.name.replace(/\.[^.]+$/, ""), "My picture"),
        kind: res.blank ? "blank" : "picture",
        createdAt: now,
        settings,
        strengthen,
        crop: res.crop,
        aspect: res.aspect,
        converted: packMatrix(res.matrix),
      },
      imagePromise:
        !res.blank && f
          ? f.arrayBuffer().then((b) => ({ name: f.name, type: f.type, bytes: new Uint8Array(b) }))
          : Promise.resolve(null),
      imageWritten: false,
    };
    matrixRef.current = res.matrix;
    savedMatrixRef.current = null;
    progressRef.current = 0;
    setProgressState(0);
    scheduleSave();
  };

  const onMatrixChange = useCallback(
    (m: StitchMatrix, converted: StitchMatrix) => {
      if (!projectRef.current || resultRef.current?.matrix !== converted) return;
      if (m === savedMatrixRef.current) return;
      savedMatrixRef.current = m;
      matrixRef.current = m;
      scheduleSave();
    },
    [scheduleSave],
  );

  const applyProject = (data: ProjectData) => {
    requestId.current++;
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    const conv = unpackMatrix(data.converted);
    const cur = unpackMatrix(data.current);
    const f = data.image ? new File([data.image.bytes.slice().buffer as ArrayBuffer], data.image.name, { type: data.image.type }) : null;
    setProjectMsg(null);
    setUploadError(null);
    setRunError(null);
    setStart(data.kind === "blank" ? "scratch" : "image");
    dispatch({ key: "orientation", value: data.settings.orientation });
    if (data.settings.sizeId === "custom" && data.settings.custom) {
      setMode("manual");
      setManualRaw({ ...rawFromCustom(data.settings.custom) });
    } else if (data.kind === "blank") {
      const g = buildGridSpec(data.settings);
      setMode("manual");
      setManualRaw({ ...rawFromCustom({ widthInches: g.widthInches, heightInches: g.heightInches, stitchesPerInch: g.gauge.stitchesPerInch, rowsPerInch: g.gauge.rowsPerInch }) });
      dispatch({ key: "sizeId", value: data.settings.sizeId });
    } else {
      setMode("quick");
      dispatch({ key: "sizeId", value: data.settings.sizeId });
    }
    dispatch({ key: "maxColors", value: data.settings.maxColors });
    setStrengthen(data.strengthen);
    setCrop(data.crop);
    setFile(f);
    const { image: _img, current: _cur, updatedAt: _u, progress: _p, ...base } = data;
    void _img; void _cur; void _u; void _p;
    projectRef.current = { base, imagePromise: Promise.resolve(data.image), imageWritten: true };
    matrixRef.current = cur;
    savedMatrixRef.current = cur;
    progressRef.current = data.progress;
    setProgressState(data.progress);
    setSaveState("saved");
    setStatus("done");
    setResult({ matrix: conv, current: cur, crop: data.crop, aspect: data.aspect, blank: data.kind === "blank" });
  };

  const openSaved = (id: string) => {
    guard.request("Opening a saved project", () => {
      getProject(id)
        .then((d) => (d ? applyProject(d) : setProjectMsg("That project couldn't be found.")))
        .catch(() => setProjectMsg("That project couldn't be opened."));
    });
  };

  const importBackup = (f: File) => {
    setProjectMsg(null);
    if (f.size > MAX_FILE_BYTES) {
      setProjectMsg("That file is too large to be a GridCrow backup.");
      return;
    }
    f.text()
      .then((text) => {
        const data = parseProjectJson(text, crypto.randomUUID());
        guard.request("Opening a backup file", () => {
          saveProject(data, { withImage: true })
            .catch(() => setStorageOk(false)) // still opens; it just can't be kept on this device
            .finally(() => {
              applyProject(data);
              refreshProjects();
            });
        });
      })
      .catch((e) =>
        setProjectMsg(
          e instanceof ProjectFormatError ? e.message : "That file couldn't be read as a GridCrow backup.",
        ),
      );
  };

  const exportBackup = async () => {
    const p = projectRef.current;
    const m = matrixRef.current;
    if (!p || !m) return;
    try {
      const image = await p.imagePromise;
      const json = projectToJson({ ...p.base, current: packMatrix(m), updatedAt: Date.now(), progress: progressRef.current, image });
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName(p.base.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setProjectMsg("The backup file couldn't be made.");
    }
  };

  const renameSaved = (id: string, name: string) => {
    const clean = cleanName(name);
    if (projectRef.current?.base.id === id) projectRef.current.base.name = clean;
    renameProject(id, clean).then(refreshProjects).catch(() => setProjectMsg("Couldn't rename that project."));
  };

  const deleteSaved = (id: string) => {
    if (projectRef.current?.base.id === id) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
      projectRef.current = null;
      setSaveState("none");
    }
    deleteProject(id).then(refreshProjects).catch(() => setProjectMsg("Couldn't delete that project."));
  };

  // Anything the chart depends on changing makes an old result stale, so it is cleared.
  const invalidate = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    projectRef.current = null;
    setSaveState("none");
    requestId.current++;
    setResult(null);
    setRunError(null);
    setStatus("idle");
  }, []);

  const chooseMode = (next: SetupMode) => {
    if (next === mode) return;
    guard.request("Changing the size", () => {
      invalidate();
      setMode(next);
      if (next === "quick") setStart("image");
    });
  };
  const changeManual = (next: ManualRaw) => {
    guard.request("Changing the size", () => {
      invalidate();
      setManualRaw(next);
      try {
        localStorage.setItem(GAUGE_KEY, JSON.stringify({ sw: next.sw, swIn: next.swIn, sh: next.sh, shIn: next.shIn }));
      } catch {
        /* the swatch just is not remembered */
      }
    });
  };

  const WHAT: Record<keyof SetupSettings, string> = {
    orientation: "Changing the orientation",
    sizeId: "Changing the size",
    maxColors: "Changing the maximum colors",
    custom: "Changing the size",
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
      const res = { matrix, crop, aspect, blank: false };
      setResult(res);
      setStatus("done");
      beginProject(res, file);
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
    const res = { matrix: makeBlankMatrix(grid.cols, grid.rows, { stitchesPerInch: grid.gauge.stitchesPerInch, rowsPerInch: grid.gauge.rowsPerInch }), crop: DEFAULT_CROP, aspect, blank: true };
    setResult(res);
    beginProject(res, null);
  };

  const chooseStart = (next: "image" | "scratch") => {
    if (next === start) return;
    guard.request(next === "scratch" ? "Starting from scratch" : "Switching to a picture", () => {
      invalidate();
      setStart(next);
    });
  };
  // Drawing from scratch lives in Manual Mode; Quick Start is pictures and preset sizes.
  const scratch = mode === "manual" && start === "scratch";

  // A new chart folds the setup away and brings the editor to the top of the screen; no chart, setup open.
  const hasResult = result !== null;
  resultRef.current = result;
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
        <ProjectsPanel
          projects={projects}
          currentId={projectRef.current?.base.id ?? null}
          onOpen={openSaved}
          onRename={renameSaved}
          onDelete={deleteSaved}
          onImport={importBackup}
          message={projectMsg}
          storageOk={storageOk}
        />
        {mode === "quick" && <ModeChoice mode={mode} onChange={chooseMode} />}
        {mode === "manual" && (
          <ManualMode raw={manualRaw} onRaw={changeManual} start={start} onStart={chooseStart} onBack={() => chooseMode("quick")} />
        )}
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
          {mode === "quick" && (
            <>
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
                  value={settings.sizeId as FinishedSizeId}
                  onChange={(v) => update("sizeId", v)}
                  columns={2}
                />
                <SizeSummary grid={grid} />
              </div>
            </>
          )}

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
            <>
              <button
                type="button"
                className="btn btn--primary"
                data-testid="open-blank"
                disabled={mode === "manual" && !manualReady}
                onClick={() => guard.request("Starting a new canvas", openBlank)}
              >
                Open Blank Canvas
                <Icon name="arrow" size={20} />
              </button>
              {mode === "manual" && !manualReady && <p className="cta-hint" data-testid="manual-hint">Finish steps 1 and 2 to continue.</p>}
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!image || status === "working" || (mode === "manual" && !manualReady)}
                onClick={() => guard.request("Building a new grid", create)}
              >
                {status === "working" ? "Building your grid…" : "Create My Crochet Grid"}
                <Icon name="arrow" size={20} />
              </button>
              {mode === "manual" && !manualReady && <p className="cta-hint" data-testid="manual-hint">Finish steps 1 and 2 to continue.</p>}
              {!file && (mode === "quick" || manualReady) && <p className="cta-hint">Add a picture to continue.</p>}
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
          <span className="setupbar__saved" data-testid="save-status" role="status">
            {saveState === "saved" && "Saved on this device"}
            {saveState === "saving" && "Saving…"}
            {saveState === "unsaved" && "Saving…"}
            {saveState === "error" && "Couldn't save here"}
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
          initialMatrix={result.current}
          onMatrixChange={onMatrixChange}
          onBackup={saveState === "none" ? undefined : exportBackup}
          progress={progress}
          onProgressChange={changeProgress}
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
