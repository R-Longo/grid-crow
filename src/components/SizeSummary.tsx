import { STANDARD_GAUGE } from "../config/gauge";
import { formatFinishedSize, formatStitchGrid } from "../engine/geometry";
import type { GridSpec } from "../engine/geometry";
import { Icon } from "./Icon";

interface SizeSummaryProps {
  grid: GridSpec;
}

/** Shows the estimated finished size and the calculated stitch grid for the current choice. */
export function SizeSummary({ grid }: SizeSummaryProps) {
  const g = STANDARD_GAUGE;
  return (
    <div className="size-summary" aria-live="polite">
      <dl>
        <dt>Finished size (approx.)</dt>
        <dd>{formatFinishedSize(grid)}</dd>
        <dt>Stitch grid</dt>
        <dd>{formatStitchGrid(grid)}</dd>
      </dl>
      <p className="size-summary__note">
        <span className="size-summary__icon">
          <Icon name="yarn" size={18} />
        </span>
        <span>
          Based on standard {g.yarnLabel.toLowerCase()} yarn and a {g.hookLabel} hook: {g.stitchesPerSwatch}{" "}
          stitches × {g.rowsPerSwatch} rows = {g.swatchInches} inches. Actual finished size may vary
          with your crochet tension.
        </span>
      </p>
    </div>
  );
}
