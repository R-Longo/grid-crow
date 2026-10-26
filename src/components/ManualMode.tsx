import { useId } from "react";
import { MAX_CHART_SIDE, describeGauge } from "../engine/gauge";
import { EMPTY_MANUAL, parseManual, standardSwatch } from "../engine/manual";
import { gaugePer, lengthLong, sizeText } from "../engine/units";
import type { UnitSystem } from "../engine/units";
import type { ManualRaw } from "../engine/manual";
import { Icon } from "./Icon";

interface ManualModeProps {
  raw: ManualRaw;
  onRaw: (next: ManualRaw) => void;
  start: "image" | "scratch";
  onStart: (s: "image" | "scratch") => void;
  onBack: () => void;
  units: UnitSystem;
}

const n1 = (v: number, digits = 2) => String(Number(v.toFixed(digits)));

/** Manual Mode: measure a swatch, say how big the piece should be, then start blank or from a picture. */
export function ManualMode({ raw, onRaw, start, onStart, onBack, units }: ManualModeProps) {
  const ids = { sw: useId(), swIn: useId(), sh: useId(), shIn: useId(), w: useId(), h: useId() };
  const r = parseManual(raw, units);
  const long = lengthLong(units);
  const per = r.gauge ? gaugePer(r.gauge, units) : null;
  const set = (k: keyof ManualRaw) => (e: React.ChangeEvent<HTMLInputElement>) => onRaw({ ...raw, [k]: e.target.value });
  const field = (k: keyof ManualRaw, label: string, placeholder: string) => (
    <div className="manual__field">
      <label htmlFor={ids[k]}>{label}</label>
      <input id={ids[k]} data-testid={`manual-${k}`} inputMode="decimal" autoComplete="off" placeholder={placeholder} value={raw[k]} onChange={set(k)} />
    </div>
  );
  return (
    <section className="manual" data-testid="manual-page" aria-label="Manual Mode">
      <button type="button" className="manual__back" data-testid="manual-back" onClick={onBack}>
        <span aria-hidden="true">‹</span> Back to home
      </button>
      <h2 className="manual__title">Manual Mode</h2>
      <p className="manual__lead">Make a chart to your own measurements.</p>

      <div className="manual__step">
        <h3>
          <span className="manual__num" aria-hidden="true">1</span> Check your gauge
        </h3>
        <p>
          Crochet a small swatch in two colors (about 10 × 10 stitches) with the yarn and hook you will really use. Count and measure the{" "}
          <strong>middle</strong>, not the edges, and type what you found. Bigger swatches are more accurate.
        </p>
        <div className="manual__grid">
          {field("sw", "Stitches counted (width)", "10")}
          {field("swIn", `${long} (width)`, units === "metric" ? "6.5" : "2.5")}
          {field("sh", "Rows counted (height)", "10")}
          {field("shIn", `${long} (height)`, units === "metric" ? "6.5" : "2.5")}
        </div>
        <div className="manual__gauge" data-testid="manual-gauge" role="status" aria-live="polite">
          {r.gauge ? (
            <>
              <strong>Your gauge</strong>
              <span className="manual__big" data-testid="manual-spi">{n1(per!.stitches, units === "metric" ? 1 : 2)}</span> stitches per {per!.per}
              <span className="manual__big" data-testid="manual-rpi">{n1(per!.rows, units === "metric" ? 1 : 2)}</span> rows per {per!.per}
            </>
          ) : (
            <span className={r.gaugeProblem ? "manual__problem" : ""}>{r.gaugeProblem || "Your gauge will show here once you type your swatch."}</span>
          )}
        </div>
        <div className="manual__links">
          <button type="button" className="manual__link" data-testid="manual-standard" onClick={() => onRaw({ ...raw, ...standardSwatch(units) })}>
            Use the standard gauge ({units === "metric" ? "about 15.7 stitches and 17.7 rows per 10 cm" : "4 stitches and 4.5 rows per inch"})
          </button>
          {raw.sw || raw.swIn || raw.sh || raw.shIn ? (
            <button type="button" className="manual__link" onClick={() => onRaw({ ...raw, sw: "", swIn: "", sh: "", shIn: "" })}>
              Clear swatch
            </button>
          ) : null}
        </div>
        <p className="manual__tip">Let the swatch rest flat before you measure. Already know your gauge? Type its stitches and {long} (for example {units === "metric" ? "16 stitches over 10 cm" : "16 stitches over 4 inches"}).</p>
      </div>

      <div className="manual__step">
        <h3>
          <span className="manual__num" aria-hidden="true">2</span> Size your project
        </h3>
        <p>Type the finished size you want. We work out the stitches and rows.</p>
        <div className="manual__grid manual__grid--two">
          {field("w", `Width (${long})`, units === "metric" ? "50" : "20")}
          {field("h", `Height (${long})`, units === "metric" ? "60" : "24")}
        </div>
        <div className="manual__result" data-testid="manual-result" role="status" aria-live="polite">
          {r.cols !== null && r.rows !== null && r.gauge && r.actualWidth !== null && r.actualHeight !== null ? (
            <>
              <strong data-testid="manual-grid">= {r.cols} stitches × {r.rows} rows</strong>
              <span>
                about {sizeText(r.actualWidth, r.actualHeight, units)} ({describeGauge(r.gauge, units)})
              </span>
            </>
          ) : (
            <span>Your stitches and rows will show here. GridCrow charts go up to {MAX_CHART_SIDE} stitches or rows on a side.</span>
          )}
          {r.sizeProblem && (
            <span className="manual__problem" data-testid="manual-problem" role="alert">
              {r.sizeProblem}
            </span>
          )}
        </div>
      </div>

      <div className="manual__step">
        <h3>
          <span className="manual__num" aria-hidden="true">3</span> Start with
        </h3>
        <p>Begin with an empty grid, or turn a picture into your chart.</p>
        <div className="manual__start">
          {(
            [
              { id: "scratch", title: "Blank canvas", sub: "Start with an empty grid", icon: "pencil" },
              { id: "image", title: "Pick a picture", sub: "Upload an image to convert", icon: "image" },
            ] as const
          ).map((c) => (
            <label className="manual__startcard" key={c.id}>
              <input type="radio" name="manual-start" data-testid={`manual-start-${c.id}`} checked={start === c.id} onChange={() => onStart(c.id)} />
              <Icon name={c.icon} size={24} />
              <span className="manual__starttitle">{c.title}</span>
              <span className="manual__startsub">{c.sub}</span>
            </label>
          ))}
        </div>
        <p className="manual__tip">You can change the size, colors and everything else after your chart is made, by tapping Change at the top.</p>
      </div>
    </section>
  );
}

export { EMPTY_MANUAL };
