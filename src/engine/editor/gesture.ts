/**
 * Turns raw pointer events into intentions: paint, pan or pinch. Pure: no DOM. This is what keeps a pan or a
 * pinch from leaving paint behind.
 *
 *  - One pointer decides what the gesture is: paint (Draw mode, primary button / touch / pen) or pan (Pan mode,
 *    middle mouse button, or Space held).
 *  - A second touch always turns the gesture into a pinch (pan + zoom) and CANCELS a stroke already begun, so the
 *    caller can undo what that stroke painted.
 *  - After a pinch, or after a pointer the machine ignores, nothing paints or pans until every pointer is lifted.
 */
export type PointerKind = "mouse" | "touch" | "pen";
export type Mode = "draw" | "pan";

export type GestureEvent =
  | { type: "down"; id: number; kind: PointerKind; x: number; y: number; button: number; mode: Mode; space: boolean }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number }
  | { type: "cancel"; id: number };

export type GestureEffect =
  | { type: "strokeStart"; x: number; y: number }
  | { type: "strokeMove"; x: number; y: number }
  | { type: "strokeEnd" }
  | { type: "strokeCancel" }
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; scale: number; cx: number; cy: number; dx: number; dy: number };

type Role = "none" | "stroke" | "pan" | "pinch" | "dead";

interface Tracked {
  x: number;
  y: number;
  kind: PointerKind;
}

export interface GestureState {
  pointers: Record<number, Tracked>;
  role: Role;
  /** The pointer that owns a stroke or a pan. */
  owner: number | null;
  pinch: { a: number; b: number; dist: number; cx: number; cy: number } | null;
}

export const initialGesture: GestureState = { pointers: {}, role: "none", owner: null, pinch: null };

export interface GestureResult {
  state: GestureState;
  effects: GestureEffect[];
}

const count = (s: GestureState) => Object.keys(s.pointers).length;

function pinchOf(s: GestureState, a: number, b: number) {
  const pa = s.pointers[a];
  const pb = s.pointers[b];
  return { dist: Math.hypot(pa.x - pb.x, pa.y - pb.y), cx: (pa.x + pb.x) / 2, cy: (pa.y + pb.y) / 2 };
}

export function gestureStep(s: GestureState, e: GestureEvent): GestureResult {
  const effects: GestureEffect[] = [];
  switch (e.type) {
    case "down": {
      const pointers = { ...s.pointers, [e.id]: { x: e.x, y: e.y, kind: e.kind } };
      // First pointer of a gesture.
      if (count(s) === 0) {
        const wantsPan = e.button === 1 || e.space || e.mode === "pan";
        if (e.button === 2 || (e.button !== 0 && e.button !== 1)) return { state: { ...s, pointers, role: "dead" }, effects };
        if (wantsPan) return { state: { pointers, role: "pan", owner: e.id, pinch: null }, effects };
        effects.push({ type: "strokeStart", x: e.x, y: e.y });
        return { state: { pointers, role: "stroke", owner: e.id, pinch: null }, effects };
      }
      // A second touch joins the first touch: pinch.
      const firstId = s.owner ?? Number(Object.keys(s.pointers)[0]);
      const first = s.pointers[firstId];
      if ((s.role === "stroke" || s.role === "pan") && first && first.kind === "touch" && e.kind === "touch" && count(s) === 1) {
        if (s.role === "stroke") effects.push({ type: "strokeCancel" });
        const p = pinchOf({ ...s, pointers }, firstId, e.id);
        return { state: { pointers, role: "pinch", owner: null, pinch: { a: firstId, b: e.id, ...p } }, effects };
      }
      // Anything else (a third finger, a second mouse button...) is ignored until all are lifted.
      return { state: { ...s, pointers }, effects };
    }
    case "move": {
      const prev = s.pointers[e.id];
      if (!prev) return { state: s, effects };
      const pointers = { ...s.pointers, [e.id]: { ...prev, x: e.x, y: e.y } };
      const next = { ...s, pointers };
      if (s.role === "pinch" && s.pinch && (e.id === s.pinch.a || e.id === s.pinch.b)) {
        const p = pinchOf(next, s.pinch.a, s.pinch.b);
        effects.push({
          type: "pinch",
          scale: s.pinch.dist > 0 && p.dist > 0 ? p.dist / s.pinch.dist : 1,
          cx: p.cx,
          cy: p.cy,
          dx: p.cx - s.pinch.cx,
          dy: p.cy - s.pinch.cy,
        });
        return { state: { ...next, pinch: { a: s.pinch.a, b: s.pinch.b, ...p } }, effects };
      }
      if (s.role === "stroke" && s.owner === e.id) effects.push({ type: "strokeMove", x: e.x, y: e.y });
      else if (s.role === "pan" && s.owner === e.id) effects.push({ type: "pan", dx: e.x - prev.x, dy: e.y - prev.y });
      return { state: next, effects };
    }
    case "up":
    case "cancel": {
      if (!s.pointers[e.id]) return { state: s, effects };
      const pointers = { ...s.pointers };
      delete pointers[e.id];
      let role = s.role;
      let owner = s.owner;
      let pinch = s.pinch;
      if (s.role === "stroke" && s.owner === e.id) {
        effects.push({ type: e.type === "up" ? "strokeEnd" : "strokeCancel" });
        role = "dead";
        owner = null;
      } else if (s.role === "pan" && s.owner === e.id) {
        role = "dead";
        owner = null;
      } else if (s.role === "pinch" && s.pinch && (e.id === s.pinch.a || e.id === s.pinch.b)) {
        role = "dead";
        pinch = null;
      }
      if (Object.keys(pointers).length === 0) return { state: initialGesture, effects };
      return { state: { pointers, role, owner, pinch }, effects };
    }
  }
}
