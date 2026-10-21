import { useEffect, useId, useState } from "react";
import type { PaletteColor } from "../engine/convert/types";
import type { AddColorResult, RecolorResult } from "../engine/editor/recolor";
import { normalizeHex } from "../engine/editor/recolor";

interface ColorEditorProps {
  /** The palette slot being edited (the color painting with right now). */
  slot: number;
  color: PaletteColor;
  /** Stitches that use this color now. */
  count: number;
  /** Slot 0 of a blank canvas: the white every stitch starts in. */
  isBackground: boolean;
  /** Tries the change; says whether it worked. */
  onApply: (hex: string) => RecolorResult;
  /** Adds the color to the palette as a new yarn color and paints with it; says whether it worked. */
  onAdd: (hex: string) => AddColorResult;
  /** The color name of another slot, for the "already in your palette" message. */
  describeSlot: (slot: number) => string;
}

/**
 * Changes the yarn color of one palette slot of a blank canvas. A change recolors EVERY stitch that uses the slot, so the
 * panel says so, with the number, and only acts on an explicit button press (never while the color picker is being dragged).
 */
export function ColorEditor({ slot, color, count, isBackground, onApply, onAdd, describeSlot }: ColorEditorProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(color.hex);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // A different slot, or an undo / redo / reset changing this slot's color, restarts the draft from the real color.
  useEffect(() => {
    setText(color.hex);
    setError(null);
  }, [slot, color.hex]);

  const normalized = normalizeHex(text);
  const picker = normalized ?? color.hex;

  const apply = () => {
    setDone(null);
    if (!normalized) {
      setError("That isn't a color yet. Use six letters or numbers, like #1f5fbf.");
      return;
    }
    const r = onApply(normalized);
    if (r.ok) {
      setError(null);
      setDone(`Recolored ${count} ${count === 1 ? "stitch" : "stitches"}.`);
    } else if (r.reason === "duplicate") {
      setError(`That color is already in your palette (${describeSlot(r.slot as number)}). Pick a slightly different shade, or paint with the one you have.`);
    } else if (r.reason === "same") {
      setError("That's the color it already is.");
    } else {
      setError("That color can't be used.");
    }
  };

  const add = () => {
    setDone(null);
    if (!normalized) {
      setError("That isn't a color yet. Use six letters or numbers, like #1f5fbf.");
      return;
    }
    const r = onAdd(normalized);
    if (r.ok) {
      setError(null);
      setDone(`Added ${r.hex.toUpperCase()}. It is selected, so you can paint with it now.`);
    } else if (r.reason === "duplicate") {
      setError(`That color is already in your palette (${describeSlot(r.slot as number)}). Pick it from the yarn colors to paint with it.`);
    } else if (r.reason === "full") {
      setError("Your palette is full (16 colors). Recolor one you are not using instead.");
    } else {
      setError("That color can't be used.");
    }
  };

  return (
    <div className="coloredit" data-testid="color-editor">
      <button
        type="button"
        className="chart__small coloredit__toggle"
        data-testid="edit-color-open"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => {
          setOpen((o) => !o);
          setDone(null);
        }}
      >
        <span className="chart__swatch" style={{ background: color.hex }} aria-hidden="true" />
        Edit this color
      </button>
      {open && (
        <div id={`${uid}-panel`} className="coloredit__panel" role="group" aria-label={`Edit ${color.hex.toUpperCase()}`}>
          <p className="coloredit__hint">
            Just want a new color for a few stitches, like a pink nose? Pick it and choose <strong>Add as a new color</strong>, then paint with it.
          </p>
          <p className="coloredit__warn" data-testid="color-warning">
            {count === 0
              ? "No stitches use this color yet, so this only changes the swatch."
              : `This recolors all ${count} ${count === 1 ? "stitch" : "stitches"} that use ${color.hex.toUpperCase()}.`}
            {isBackground && " It is your background color. You can undo it."}
            {!isBackground && count > 0 && " You can undo it."}
          </p>
          <div className="coloredit__row">
            <label htmlFor={`${uid}-pick`} className="coloredit__label">
              Pick
            </label>
            <input id={`${uid}-pick`} type="color" className="coloredit__picker" value={picker} onChange={(e) => setText(e.target.value)} />
            <label htmlFor={`${uid}-hex`} className="coloredit__label">
              Color code
            </label>
            <input
              id={`${uid}-hex`}
              type="text"
              className="coloredit__hex"
              data-testid="color-hex"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={7}
              value={text}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
                setDone(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />
          </div>
          <button type="button" className="chart__small chart__small--primary" data-testid="color-add" onClick={add}>
            Add as a new color
          </button>
          <button type="button" className="chart__small" data-testid="color-apply" onClick={apply}>
            {count === 0 ? "Change color" : `Recolor ${count} ${count === 1 ? "stitch" : "stitches"}`}
          </button>
          <p className={error ? "coloredit__msg coloredit__msg--error" : "coloredit__msg"} role={error ? "alert" : "status"} data-testid="color-message">
            {error ?? done ?? ""}
          </p>
        </div>
      )}
    </div>
  );
}
