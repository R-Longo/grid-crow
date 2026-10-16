/**
 * Protects hand edits. Anything that would replace the edited chart (a new "Create", a different picture, crop,
 * orientation, size or color limit) first asks, when there are edits to lose. This file is the decision logic only,
 * with no React and no DOM, so it can be tested on its own.
 */

/** A change the person asked for that is waiting for their answer. */
export interface PendingDiscard {
  /** What they were doing, as a phrase that starts a sentence: "Changing the size". */
  what: string;
  /** Carries the change out. */
  apply: () => void;
}

/**
 * A request to make a change that replaces the chart.
 * - No hand edits: the change runs straight away and nothing is stored.
 * - Hand edits: nothing runs; the change waits for an answer. A second request while one is waiting (a slider or a
 *   drag firing again) replaces the waiting change but keeps the first description, so the message does not flicker.
 */
export function requestDiscard(
  pending: PendingDiscard | null,
  changed: number,
  what: string,
  apply: () => void,
): { run: boolean; pending: PendingDiscard | null } {
  if (!(changed > 0)) return { run: true, pending: null };
  return { run: false, pending: { what: pending ? pending.what : what, apply } };
}

/** The wording shown in the confirmation. */
export function discardMessage(changed: number, what: string): { title: string; text: string } {
  const n = Math.max(0, Math.floor(changed));
  const stitches = `${n.toLocaleString("en-US")} hand-edited ${n === 1 ? "stitch" : "stitches"}`;
  return {
    title: "Replace your edited chart?",
    text: `${what} builds a new chart. Your ${stitches} and your undo history will be discarded, and GridCrow can't get them back.`,
  };
}

/** Should the browser ask "Leave this page?" Only while there are hand edits that exist nowhere else. */
export function shouldWarnOnLeave(changed: number): boolean {
  return changed > 0;
}
