import { useCallback, useEffect, useRef, useState } from "react";
import { requestDiscard, shouldWarnOnLeave } from "./discardGuard";
import type { PendingDiscard } from "./discardGuard";

/**
 * Ties the guard logic to a page. `changed` is how many stitches the person has hand-edited right now.
 *  - `request(what, apply)` runs `apply` at once when there is nothing to lose, otherwise waits for `confirm` / `cancel`.
 *  - While there are edits, closing or reloading the tab triggers the browser's own "Leave this page?" prompt.
 *    (Browsers do not allow custom wording there, and some phones skip it when the tab is swiped away.)
 */
export function useDiscardGuard(changed: number) {
  const [pending, setPending] = useState<PendingDiscard | null>(null);
  const pendingRef = useRef<PendingDiscard | null>(null);
  const changedRef = useRef(changed);
  changedRef.current = changed;

  const request = useCallback((what: string, apply: () => void) => {
    const r = requestDiscard(pendingRef.current, changedRef.current, what, apply);
    pendingRef.current = r.pending;
    setPending(r.pending);
    if (r.run) apply();
  }, []);

  const confirm = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    p?.apply();
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  // If the edits disappear while a question is open (they cannot today, but undoing everything would do it), drop it.
  useEffect(() => {
    if (changed === 0 && pendingRef.current) {
      pendingRef.current = null;
      setPending(null);
    }
  }, [changed]);

  const warn = shouldWarnOnLeave(changed);
  useEffect(() => {
    if (!warn) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // required by some browsers to show the prompt
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [warn]);

  return { pending, request, confirm, cancel };
}
