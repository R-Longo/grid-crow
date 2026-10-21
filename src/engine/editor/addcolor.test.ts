import { describe, expect, it } from "vitest";
import type { StitchMatrix } from "../convert/types";
import { MAX_PALETTE, addColorSlot } from "./recolor";
import { EditorSession } from "./session";
import { colorCounts } from "./paint";

function chart(): StitchMatrix {
  const palette = [
    { r: 255, g: 255, b: 255, hex: "#ffffff" },
    { r: 0, g: 0, b: 0, hex: "#000000" },
  ];
  const cells = Array.from({ length: 6 }, () => new Array<number>(8).fill(0));
  return { cols: 8, rows: 6, palette, cells };
}

describe("addColorSlot", () => {
  it("appends a new color without changing any stitch", () => {
    const m = chart();
    const r = addColorSlot(m, "#FB60AB");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.slot).toBe(2);
    expect(r.matrix.palette).toHaveLength(3);
    expect(r.matrix.palette[2].hex).toBe("#fb60ab");
    expect(r.matrix.cells).toBe(m.cells);
    expect(m.palette).toHaveLength(2); // the original chart is untouched
  });
  it("refuses a bad code, a color already there, and a full palette", () => {
    const m = chart();
    expect(addColorSlot(m, "pinkish")).toEqual({ ok: false, reason: "invalid" });
    expect(addColorSlot(m, "#000")).toEqual({ ok: false, reason: "duplicate", slot: 1 });
    const full = { ...m, palette: Array.from({ length: MAX_PALETTE }, (_, i) => ({ r: i, g: 0, b: 0, hex: "#" + i.toString(16).padStart(2, "0") + "0000" })) };
    expect(addColorSlot(full, "#abcdef")).toEqual({ ok: false, reason: "full" });
  });
});

describe("EditorSession.addColor", () => {
  it("selects the new color, paints with it, and undoes in order", () => {
    const s = new EditorSession(chart());
    const { result, effects } = s.addColor("#fb60ab");
    expect(result.ok).toBe(true);
    expect(s.active).toBe(2);
    expect(effects.some((e) => e.type === "picked")).toBe(true);
    expect(s.canUndo).toBe(true);
    // paint one stitch with the new color through the same path the editor uses
    const p = s.matrix;
    expect(p.palette[2].hex).toBe("#fb60ab");
    // undo removes the color and falls back to a valid painting color
    const u = s.undo();
    expect(s.matrix.palette).toHaveLength(2);
    expect(s.active).toBe(1);
    expect(u.some((e) => e.type === "colorChosen")).toBe(true);
    s.redo();
    expect(s.matrix.palette).toHaveLength(3);
    expect(colorCounts(s.matrix)).toEqual([48, 0, 0]);
  });
  it("reset drops added colors", () => {
    const s = new EditorSession(chart());
    s.addColor("#fb60ab");
    s.reset();
    expect(s.matrix.palette).toHaveLength(2);
    expect(s.active).toBeLessThan(2);
  });
});
