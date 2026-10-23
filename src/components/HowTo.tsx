import { useEffect, useId, useRef, useState } from "react";
import { STANDARD_GAUGE } from "../config/gauge";
import { FINISHED_SIZES } from "../config/sizes";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { SizeIllustration } from "./SizeIllustration";

const G = STANDARD_GAUGE;
const YARN_TEXT = G.yarnLabel.toLowerCase().replace(" weight", "-weight"); // "worsted-weight #4"

const STEPS: { icon: IconName; title: string; body: string; showSizes?: boolean }[] = [
  {
    icon: "yarn",
    title: "Choose how to begin",
    body: "Convert a photo or drawing into a stitch chart, or start with a blank canvas and create your own design.",
  },
  {
    icon: "image",
    title: "Add your image (if converting)",
    body: "Upload a JPG, PNG, or WebP image. If you're drawing from scratch, skip this step.",
  },
  {
    icon: "overlap",
    title: "Choose your tapestry size and orientation",
    showSizes: true,
    body: "Select a finished size and orientation. GridCrow calculates the stitches and rows using the standard gauge.",
  },
  {
    icon: "pencil",
    title: "Strengthen lines (optional)",
    body: "Converting a drawing with thin, dark outlines? Turn on Strengthen Lines to help those details survive conversion. Not needed for blank canvas designs.",
  },
  {
    icon: "palette",
    title: "Create and edit your chart",
    body: "Convert your image or open a white stitch grid. Use Paint, Fill, Eyedropper, and Undo to perfect your pattern.",
  },
  {
    icon: "download",
    title: "Download your pattern",
    body: "Save your finished stitch chart as a PNG image or a single- or multi-page PDF.",
  },
  {
    icon: "check",
    title: "Crochet it and track your progress",
    body: "Switch from Edit to Track and crochet along on screen. Tap Next stitch, or tap a stitch on the chart to mark your progress.",
  },
  {
    icon: "options",
    title: "Pick up where you left off",
    body: "Your project saves on this device, reopen it anytime from My Projects on the setup screen.",
  },
];

export function HowTo() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close on outside click or Escape (and return focus to the button).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="howto" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="howto__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="help" size={18} />
        <span className="howto__label">How-To</span>
        <Icon name="chevron" size={16} className="howto__chevron" />
      </button>
      {open && (
        <div className="howto__panel" id={panelId} role="region" aria-label="How to use GridCrow">
          <div className="howto__head">
            <h2>How to Use GridCrow</h2>
            <button type="button" className="howto__close" aria-label="Close how-to" onClick={() => setOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <ol className="howto__steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="howto__icon">
                  <Icon name={s.icon} size={26} />
                </span>
                <span className="howto__content">
                  <span className="howto__step-title">
                    <span className="howto__num">{i + 1}</span>
                    {s.title}
                  </span>
                  {s.showSizes && (
                    <ul className="howto__sizes" aria-label="Available finished sizes in inches">
                      {FINISHED_SIZES.map((size, i) => (
                        <li key={size.id}>
                          <SizeIllustration widthIn={size.width} heightIn={size.height} level={i} />
                          <span className="howto__size-label">{`${size.width} × ${size.height}"`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="howto__step-body">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="howto__note">
            <strong>One square = one single crochet stitch.</strong>
            <span className="howto__note-detail">
              For the most accurate finished size, check your gauge: {G.stitchesPerSwatch} single
              crochet stitches across and {G.rowsPerSwatch} rows high should measure{" "}
              <span className="nowrap">
                {G.swatchInches} × {G.swatchInches} inches
              </span>{" "}
              using {YARN_TEXT} yarn and a {G.hookLabel} hook.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
