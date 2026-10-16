import { describe, expect, it } from "vitest";
import { gestureStep, initialGesture } from "./gesture";
import type { GestureEffect, GestureEvent, GestureState, Mode } from "./gesture";

function run(events: GestureEvent[]): { effects: GestureEffect[]; state: GestureState } {
  let state = initialGesture;
  const effects: GestureEffect[] = [];
  for (const e of events) {
    const r = gestureStep(state, e);
    state = r.state;
    effects.push(...r.effects);
  }
  return { effects, state };
}
const down = (id: number, kind: "mouse" | "touch" | "pen", x: number, y: number, o: { button?: number; mode?: Mode; space?: boolean } = {}): GestureEvent => ({
  type: "down", id, kind, x, y, button: o.button ?? 0, mode: o.mode ?? "draw", space: o.space ?? false,
});
const move = (id: number, x: number, y: number): GestureEvent => ({ type: "move", id, x, y });
const up = (id: number): GestureEvent => ({ type: "up", id });
const cancel = (id: number): GestureEvent => ({ type: "cancel", id });
const types = (r: { effects: GestureEffect[] }) => r.effects.map((e) => e.type);

describe("mouse", () => {
  it("left button paints in Draw mode: start, move, end", () => {
    const r = run([down(1, "mouse", 5, 5), move(1, 8, 9), move(1, 12, 9), up(1)]);
    expect(types(r)).toEqual(["strokeStart", "strokeMove", "strokeMove", "strokeEnd"]);
    expect(r.state).toEqual(initialGesture);
  });
  it("left button pans in Pan mode and never paints", () => {
    const r = run([down(1, "mouse", 5, 5, { mode: "pan" }), move(1, 8, 9), up(1)]);
    expect(types(r)).toEqual(["pan"]);
    expect(r.effects[0]).toEqual({ type: "pan", dx: 3, dy: 4 });
  });
  it("Space or the middle button pans even in Draw mode", () => {
    expect(types(run([down(1, "mouse", 0, 0, { space: true }), move(1, 4, 4), up(1)]))).toEqual(["pan"]);
    expect(types(run([down(1, "mouse", 0, 0, { button: 1 }), move(1, 4, 4), up(1)]))).toEqual(["pan"]);
  });
  it("the right button does nothing", () => {
    expect(types(run([down(1, "mouse", 0, 0, { button: 2 }), move(1, 4, 4), up(1)]))).toEqual([]);
  });
  it("moves with no button down do nothing", () => {
    expect(types(run([move(1, 4, 4)]))).toEqual([]);
  });
});

describe("touch", () => {
  it("one finger paints in Draw mode and pans in Pan mode", () => {
    expect(types(run([down(1, "touch", 0, 0), move(1, 5, 5), up(1)]))).toEqual(["strokeStart", "strokeMove", "strokeEnd"]);
    expect(types(run([down(1, "touch", 0, 0, { mode: "pan" }), move(1, 5, 5), up(1)]))).toEqual(["pan"]);
  });
  it("a second finger cancels the stroke already begun, then pans/zooms; nothing paints after", () => {
    const r = run([
      down(1, "touch", 100, 100),
      move(1, 110, 100),
      down(2, "touch", 200, 100),
      move(2, 220, 100),
      move(1, 100, 100),
      up(2),
      move(1, 150, 150), // the remaining finger must not paint
      up(1),
    ]);
    expect(types(r)).toEqual(["strokeStart", "strokeMove", "strokeCancel", "pinch", "pinch"]);
  });
  it("pinch reports scale and centre movement", () => {
    const r = run([down(1, "touch", 100, 100, { mode: "pan" }), down(2, "touch", 200, 100), move(2, 300, 100)]);
    const p = r.effects.find((e) => e.type === "pinch");
    expect(p).toMatchObject({ type: "pinch", scale: 2, cx: 200, dx: 50, dy: 0 });
  });
  it("a gesture that began as a pinch never paints, even once one finger lifts and the other moves", () => {
    const r = run([down(1, "touch", 0, 0, { mode: "pan" }), down(2, "touch", 50, 0), up(1), move(2, 80, 80), up(2)]);
    expect(types(r)).not.toContain("strokeStart");
    expect(types(r)).not.toContain("strokeMove");
    expect(types(r)).not.toContain("pan");
  });
  it("a browser-cancelled touch cancels the stroke", () => {
    const r = run([down(1, "touch", 0, 0), move(1, 5, 5), cancel(1)]);
    expect(types(r)).toEqual(["strokeStart", "strokeMove", "strokeCancel"]);
    expect(r.state).toEqual(initialGesture);
  });
  it("a third finger is ignored", () => {
    const r = run([down(1, "touch", 0, 0), down(2, "touch", 50, 0), down(3, "touch", 90, 90), move(3, 95, 95)]);
    expect(types(r)).toEqual(["strokeStart", "strokeCancel"]);
  });
  it("a new gesture works after everything is lifted", () => {
    const r = run([down(1, "touch", 0, 0), down(2, "touch", 50, 0), up(1), up(2), down(3, "touch", 9, 9), move(3, 12, 12), up(3)]);
    expect(types(r).slice(-3)).toEqual(["strokeStart", "strokeMove", "strokeEnd"]);
  });
});

describe("pen", () => {
  it("paints like a finger", () => {
    expect(types(run([down(1, "pen", 0, 0), move(1, 3, 3), up(1)]))).toEqual(["strokeStart", "strokeMove", "strokeEnd"]);
  });
});

describe("a pan never paints (long random event streams)", () => {
  it("in Pan mode no event stream produces a stroke", () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let trial = 0; trial < 200; trial++) {
      let state = initialGesture;
      const down_: number[] = [];
      for (let i = 0; i < 40; i++) {
        const id = rnd(3) + 1;
        const kind = rnd(2) ? "touch" : "mouse";
        let e: GestureEvent;
        const k = rnd(4);
        if (k === 0 && !down_.includes(id)) {
          e = down(id, kind, rnd(300), rnd(300), { mode: "pan" });
          down_.push(id);
        } else if (k === 1) e = move(id, rnd(300), rnd(300));
        else if (k === 2) {
          e = up(id);
          down_.splice(down_.indexOf(id), 1);
        } else e = cancel(id);
        const r = gestureStep(state, e);
        state = r.state;
        for (const ef of r.effects) expect(["strokeStart", "strokeMove", "strokeEnd"]).not.toContain(ef.type);
      }
    }
  });
});
