import { useEffect, useId, useRef } from "react";
import { discardMessage } from "../state/discardGuard";

interface ConfirmDiscardProps {
  changed: number;
  what: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * "This will replace your edited chart" confirmation. A native modal dialog, so the page behind it cannot be used,
 * focus stays inside, and Escape answers "Keep editing". It opens with focus on the safe choice, and clicking the
 * dim area outside does nothing, so a stray tap can never discard work.
 */
export function ConfirmDiscard({ changed, what, onConfirm, onCancel }: ConfirmDiscardProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const { title, text } = discardMessage(changed, what);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    keepRef.current?.focus();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="discard"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault(); // Escape: keep the dialog's state in our hands
        onCancel();
      }}
    >
      <p id={titleId} className="chart__dialog-title">
        {title}
      </p>
      <p id={descId} className="chart__dialog-text">
        {text}
      </p>
      <div className="chart__dialog-actions">
        <button ref={keepRef} type="button" className="chart__small" onClick={onCancel}>
          Keep editing
        </button>
        <button type="button" className="chart__small chart__small--danger" onClick={onConfirm}>
          Discard edits and continue
        </button>
      </div>
    </dialog>
  );
}
