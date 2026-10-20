import { describe, expect, it } from "vitest";
import { makeBlankMatrix } from "../blank";
import { buildPatternModel } from "../export/pattern";
import { EditorSession } from "./session";
import { countDifferences } from "./paint";
import { normalizeHex, recolorSlot } from "./recolor";

const down = (s: EditorSession, c: number, r: number) => {
  const at = () => ({ col: c, row: r });
  s.handle({ type: "down", id: 1, kind: "mouse", x: 0, y: 0, button: 0 }, at);
  s.handle({ type: "up", id: 1 }, at);
};

describe("normalizeHex", () => {
  it("accepts 3 and 6 digit colors with or without #, and rejects the rest", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("12ab9f")).toBe("#12ab9f");
    expect(normalizeHex(" #FF0000 ")).toBe("#ff0000");
    for (const bad of ["", "#12", "#12345", "#1234567", "red", "#gg0000"]) expect(normalizeHex(bad)).toBeNull();
  });
});

describe("recolorSlot", () => {
  const m = makeBlankMatrix(12, 12);
  it("changes only the palette entry; the stitches keep their index and the cells are shared", () => {
    const r = recolorSlot(m, 3, "#00aa88");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matrix.palette[3].hex).toBe("#00aa88");
    expect(r.matrix.palette[3]).toMatchObject({ r: 0, g: 170, b: 136 });
    expect(r.matrix.cells).toBe(m.cells);
    expect(m.palette[3].hex).toBe("#1f5fbf"); // the old matrix is untouched
  });
  it("blocks a color another slot already has (any letter case), an invalid color and a missing slot", () => {
    expect(recolorSlot(m, 3, "#D62828")).toEqual({ ok: false, reason: "duplicate", slot: 2 });
    expect(recolorSlot(m, 3, "#fff")).toEqual({ ok: false, reason: "duplicate", slot: 0 });
    expect(recolorSlot(m, 3, "blue")).toEqual({ ok: false, reason: "invalid" });
    expect(recolorSlot(m, 99, "#123456")).toEqual({ ok: false, reason: "missing" });
    expect(recolorSlot(m, 3, "#1F5FBF")).toEqual({ ok: false, reason: "same" });
  });
});

describe("recolor in an editing session", () => {
  it("recoloring the white background recolors every white stitch, in the exports too, and undo/redo restore it", () => {
    const s = new EditorSession(makeBlankMatrix(10, 10));
    s.setActive(1);
    down(s, 2, 2); // one black stitch
    const out = s.recolor(0, "#fdf1d6");
    expect(out.result.ok).toBe(true);
    expect(out.effects.find((e) => e.type === "committed")).toMatchObject({ action: "recolor", stitches: 99, changed: 99 + 1 });
    let model = buildPatternModel(s.matrix);
    expect(model.colors.map((c) => [c.letter, c.hex, c.count])).toEqual([["A", "#FDF1D6", 99], ["B", "#111111", 1]]);
    s.undo();
    expect(s.matrix.palette[0].hex).toBe("#ffffff");
    expect(s.changedCount()).toBe(1);
    s.redo();
    expect(s.matrix.palette[0].hex).toBe("#fdf1d6");
    expect(s.changedCount()).toBe(100);
    s.reset();
    model = buildPatternModel(s.matrix);
    expect(model.colors.map((c) => [c.hex, c.count])).toEqual([["#FFFFFF", 100]]);
    expect(s.changedCount()).toBe(0);
  });

  it("is one undo step, mixed in order with painting, and a new action after undo clears redo", () => {
    const s = new EditorSession(makeBlankMatrix(8, 8));
    s.setActive(2);
    down(s, 0, 0);
    s.recolor(2, "#aa0000");
    down(s, 1, 0);
    s.undo(); // the second stitch
    expect(s.matrix.cells[0][1]).toBe(0);
    expect(s.matrix.palette[2].hex).toBe("#aa0000");
    s.undo(); // the recolor
    expect(s.matrix.palette[2].hex).toBe("#d62828");
    expect(s.matrix.cells[0][0]).toBe(2);
    s.undo(); // the first stitch
    expect(s.matrix.cells[0][0]).toBe(0);
    expect(s.canUndo).toBe(false);
    s.redo(); s.redo();
    expect(s.matrix.palette[2].hex).toBe("#aa0000");
    s.undo();
    s.setActive(3);
    down(s, 4, 4);
    expect(s.canRedo).toBe(false);
  });

  it("a refused recolor changes nothing and adds no undo step", () => {
    const s = new EditorSession(makeBlankMatrix(8, 8));
    const before = s.matrix;
    const out = s.recolor(1, "#ffffff");
    expect(out.result).toEqual({ ok: false, reason: "duplicate", slot: 0 });
    expect(out.effects).toEqual([]);
    expect(s.matrix).toBe(before);
    expect(s.canUndo).toBe(false);
  });

  it("is refused while a stroke is in progress", () => {
    const s = new EditorSession(makeBlankMatrix(8, 8));
    s.handle({ type: "down", id: 1, kind: "mouse", x: 0, y: 0, button: 0 }, () => ({ col: 0, row: 0 }));
    expect(s.recolor(1, "#123456").effects).toEqual([]);
    expect(s.matrix.palette[1].hex).toBe("#111111");
  });
});

describe("counting changes with recolored yarn", () => {
  it("counts a stitch changed when its index changed OR its yarn color was recolored, never twice", () => {
    const a = makeBlankMatrix(6, 6);
    const b = { ...a, palette: a.palette.map((p, i) => (i === 0 ? { ...p, hex: "#eeeeee" } : p)), cells: a.cells.map((r) => r.slice()) };
    expect(countDifferences(b, a)).toBe(36);
    b.cells[0][0] = 1;
    expect(countDifferences(b, a)).toBe(36);
    expect(countDifferences(a, a)).toBe(0);
  });
});
