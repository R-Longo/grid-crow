import { useEffect, useId, useRef } from "react";

interface ConfirmResetProps {
  changed: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Small in-app confirmation before throwing edits away. It opens with focus on the safe choice ("Keep editing"),
 * Escape cancels, and it is announced to screen readers as an alert dialog.
 */
export function ConfirmReset({ changed, onConfirm, onCancel }: ConfirmResetProps) {
  const titleId = useId();
  const descId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <div
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="chart__dialog"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <p id={titleId} className="chart__dialog-title">
        Reset to the converted chart?
      </p>
      <p id={descId} className="chart__dialog-text">
        This discards your {changed} changed {changed === 1 ? "stitch" : "stitches"}. It also clears your undo history, so it can't be undone.
      </p>
      <div className="chart__dialog-actions">
        <button type="button" className="chart__small chart__small--danger" onClick={onConfirm}>
          Yes, reset
        </button>
        <button ref={keepRef} type="button" className="chart__small" onClick={onCancel}>
          Keep editing
        </button>
      </div>
    </div>
  );
}
