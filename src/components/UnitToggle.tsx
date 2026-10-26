import type { UnitSystem } from "../engine/units";

/** Inches and yards, or centimeters and meters. Only changes how things are shown and typed, never the chart. */
export function UnitToggle({ units, onChange }: { units: UnitSystem; onChange: (u: UnitSystem) => void }) {
  return (
    <div className="units" role="group" aria-label="Measuring units">
      {(
        [
          { id: "imperial", label: "Inches" },
          { id: "metric", label: "Centimeters" },
        ] as const
      ).map((o) => (
        <button key={o.id} type="button" className="units__btn" data-testid={`units-${o.id}`} aria-pressed={units === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
