import { useEffect, useId, useMemo, useState } from "react";
import { METERS_PER_YARD, yarnLong } from "../engine/units";
import type { UnitSystem } from "../engine/units";
import type { StitchMatrix } from "../engine/convert/types";
import { buildPatternModel, formatCount, yardsText, yarnNote } from "../engine/export/pattern";
import { skeinsFor } from "../engine/yarn/estimate";

const KEY = "gridcrow.yardsPerSkein";
const KEY_M = "gridcrow.metersPerSkein";
function loadSkein(units: UnitSystem): number {
  const fallback = units === "metric" ? 180 : 200;
  try {
    const n = Number(window.localStorage.getItem(units === "metric" ? KEY_M : KEY));
    return n >= 10 && n <= 2000 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** A rough guide to how much yarn to buy for this chart. Worked out from the stitch counts, never a measurement. */
export function YarnEstimate({ matrix, units = "imperial" }: { matrix: StitchMatrix; units?: UnitSystem }) {
  const model = useMemo(() => buildPatternModel(matrix, units), [matrix, units]);
  const [skein, setSkein] = useState(() => loadSkein(units));
  // The skein size is remembered per unit, so switching units brings back the number typed for that unit.
  useEffect(() => setSkein(loadSkein(units)), [units]);
  const id = useId();
  const setAmount = (v: string) => {
    const n = Math.round(Number(v));
    setSkein(Number.isFinite(n) ? n : 0);
    try {
      if (n >= 10 && n <= 2000) window.localStorage.setItem(units === "metric" ? KEY_M : KEY, String(n));
    } catch {
      /* a remembered number is a convenience only */
    }
  };
  const ok = skein >= 10 && skein <= 2000;
  return (
    <details className="yarn" data-testid="yarn-estimate">
      <summary className="yarn__summary">Yarn estimate (rough)</summary>
      <p className="yarn__total" data-testid="yarn-total">
        About <strong>{yardsText(model.lowYards, model.highYards, units)}</strong> in all
      </p>
      <label className="yarn__skein" htmlFor={id}>
        {yarnLong(units)} in one skein
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={10}
          max={2000}
          value={skein || ""}
          data-testid="yarn-skein"
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      <ul className="yarn__list">
        {model.colors.map((c) => (
          <li key={c.index} data-testid="yarn-row">
            <span className="yarn__swatch" style={{ background: c.hex }} aria-hidden="true" />
            <span className="yarn__hex">{c.hex}</span>
            <span className="yarn__yd">{yardsText(c.lowYards, c.highYards, units)}</span>
            <span className="yarn__sk">
              {ok ? `${skeinsFor(c.highYards, units === "metric" ? skein / METERS_PER_YARD : skein)} ${skeinsFor(c.highYards, units === "metric" ? skein / METERS_PER_YARD : skein) === 1 ? "skein" : "skeins"}` : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="yarn__note" data-testid="yarn-note">
        {yarnNote(model)} Skeins are rounded up from the high number for each color. {formatCount(model.total)} stitches in all.
      </p>
    </details>
  );
}
