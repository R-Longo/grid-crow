import { startingSteps } from "../engine/export/pattern";

/** The written start of the pattern: foundation chain, then how rows 1 and 2 begin. Depends only on the chart's width. */
export function StartInstructions({ cols }: { cols: number }) {
  return (
    <details className="yarn" data-testid="start-instructions">
      <summary className="yarn__summary">Starting instructions</summary>
      {startingSteps(cols).map((s) => (
        <p className="yarn__note" key={s.heading}>
          <strong>{s.heading}</strong>
          <br />
          {s.text}
        </p>
      ))}
    </details>
  );
}
