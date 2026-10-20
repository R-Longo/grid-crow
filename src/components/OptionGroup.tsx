import { useId } from "react";
import type { CSSProperties } from "react";
import type { OptionDef } from "../config/options";
import { Icon } from "./Icon";

interface OptionGroupProps<T extends string | number> {
  legend: string;
  options: OptionDef<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Leading decoration shown before the options (e.g. a palette icon). */
  lead?: React.ReactNode;
  /** Number of grid columns; defaults to one per option. */
  columns?: number;
  /** Extra class on the options grid (layout hooks in the stylesheet). */
  className?: string;
}

/** Accessible segmented control built on native radio inputs. */
export function OptionGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  lead,
  columns,
  className,
}: OptionGroupProps<T>) {
  const name = useId();
  const style = { "--cols": columns ?? options.length } as CSSProperties;
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={className ? `options ${className}` : "options"} style={style}>
        {lead && <span className="options__lead">{lead}</span>}
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <label className="option" key={opt.value}>
              <input
                type="radio"
                name={name}
                value={String(opt.value)}
                checked={selected}
                onChange={() => onChange(opt.value)}
              />
              <span className="option__face">
                {opt.icon && (
                  <span className="option__icon" style={opt.iconColor ? { color: opt.iconColor } : undefined}>
                    <Icon name={opt.icon} size={opt.hint ? 26 : 22} />
                  </span>
                )}
                <span className="option__text">
                  <span className="option__label">{opt.label}</span>
                  {opt.hint && <span className="option__hint">{opt.hint}</span>}
                </span>
                <span className="option__radio" aria-hidden="true">
                  {selected && <Icon name="check" size={12} />}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
