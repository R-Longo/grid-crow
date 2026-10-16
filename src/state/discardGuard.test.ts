import { describe, expect, it, vi } from "vitest";
import { discardMessage, requestDiscard, shouldWarnOnLeave } from "./discardGuard";

describe("requestDiscard", () => {
  it("runs the change straight away when there are no hand edits", () => {
    const apply = vi.fn();
    const r = requestDiscard(null, 0, "Changing the size", apply);
    expect(r).toEqual({ run: true, pending: null });
    expect(apply).not.toHaveBeenCalled(); // the caller runs it; the decision function never does
  });

  it("holds the change back when there are edits", () => {
    const apply = vi.fn();
    const r = requestDiscard(null, 3, "Changing the size", apply);
    expect(r.run).toBe(false);
    expect(r.pending).toEqual({ what: "Changing the size", apply });
    expect(apply).not.toHaveBeenCalled();
  });

  it("a repeat request (a slider or drag firing again) keeps the first wording but the newest change", () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = requestDiscard(null, 5, "Changing the crop", first);
    const b = requestDiscard(a.pending, 5, "Changing the picture", second);
    expect(b.run).toBe(false);
    expect(b.pending?.what).toBe("Changing the crop");
    expect(b.pending?.apply).toBe(second);
  });

  it("a stale waiting change is dropped when the edits are gone", () => {
    const a = requestDiscard(null, 5, "Changing the size", vi.fn());
    const apply = vi.fn();
    const b = requestDiscard(a.pending, 0, "Changing the size", apply);
    expect(b).toEqual({ run: true, pending: null });
  });

  it("treats nonsense counts as 'nothing to lose'", () => {
    for (const bad of [0, -1, NaN, undefined as unknown as number]) {
      expect(requestDiscard(null, bad, "x", vi.fn()).run).toBe(true);
    }
  });
});

describe("discardMessage", () => {
  it("says how many stitches, with the right singular and plural", () => {
    expect(discardMessage(1, "Changing the size").text).toContain("1 hand-edited stitch ");
    expect(discardMessage(2, "Changing the size").text).toContain("2 hand-edited stitches");
    expect(discardMessage(1234, "Changing the size").text).toContain("1,234 hand-edited stitches");
  });
  it("names the action, mentions undo history, and promises nothing it cannot keep", () => {
    const m = discardMessage(7, "Building a new grid");
    expect(m.title).toBe("Replace your edited chart?");
    expect(m.text.startsWith("Building a new grid builds a new chart.")).toBe(true);
    expect(m.text).toContain("undo history");
    expect(m.text).toContain("can't get them back");
  });
});

describe("shouldWarnOnLeave", () => {
  it("warns only while there are hand edits", () => {
    expect(shouldWarnOnLeave(0)).toBe(false);
    expect(shouldWarnOnLeave(1)).toBe(true);
    expect(shouldWarnOnLeave(500)).toBe(true);
    expect(shouldWarnOnLeave(NaN)).toBe(false);
  });
});
