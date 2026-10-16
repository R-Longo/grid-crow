import { useEffect, useId, useRef, useState } from "react";
import { STANDARD_GAUGE } from "../config/gauge";
import { FINISHED_SIZES } from "../config/sizes";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import { SizeIllustration } from "./SizeIllustration";

const G = STANDARD_GAUGE;
const YARN_TEXT = G.yarnLabel.toLowerCase().replace(" weight", "-weight"); // "worsted-weight #4"

const STEPS: { icon: IconName; title: string; body: string; showSizes?: boolean }[] = [
  { icon: "image", title: "Upload your image", body: "Accepts JPG, PNG, and WebP files." },
  { icon: "portrait", title: "Choose orientation", body: "Portrait or landscape." },
  {
    icon: "overlap",
    title: "Pick your finished size",
    showSizes: true,
    body: "Available in portrait or landscape.",
  },
  { icon: "palette", title: "Choose your yarn colors", body: "Limit your chart to 4, 6, 8, or 10 colors." },
  { icon: "pencil", title: "Create, edit & download", body: "Generate your grid, fix any stitch you like, and download your chart." },
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
