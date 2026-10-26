import { Icon } from "./Icon";

export type SetupMode = "quick" | "manual";

/** The first choice on the setup screen: a quick start with preset sizes, or Manual Mode with your own gauge and measurements. */
export function ModeChoice({ mode, onChange }: { mode: SetupMode; onChange: (m: SetupMode) => void }) {
  const tiles = [
    { id: "quick", title: "Quick Start", sub: "Use preset sizes for an easy setup", icon: "image" },
    { id: "manual", title: "Manual Mode", sub: "Use your own gauge and measurements", icon: "ruler" },
  ] as const;
  return (
    <fieldset className="mode">
      <legend>How do you want to begin?</legend>
      <div className="mode__tiles">
        {tiles.map((t) => (
          <label className="mode__tile" key={t.id}>
            <input type="radio" name="mode" value={t.id} data-testid={`mode-${t.id}-choice`} checked={mode === t.id} onChange={() => onChange(t.id)} />
            <Icon name={t.icon} size={26} />
            <span className="mode__title">{t.title}</span>
            <span className="mode__sub">{t.sub}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
