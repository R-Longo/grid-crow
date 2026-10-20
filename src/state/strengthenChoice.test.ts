import { describe, expect, it } from "vitest";
import { strengthenActive, strengthenOffered } from "./strengthenChoice";

describe("strengthen choice", () => {
  it("is offered from 16 x 20 (64 stitches across) upward, not on the small sizes", () => {
    expect(strengthenOffered(24)).toBe(false);
    expect(strengthenOffered(48)).toBe(false);
    expect(strengthenOffered(64)).toBe(true);
    expect(strengthenOffered(96)).toBe(true);
  });
  it("applies only when ticked and offered; a tick left over from a bigger size does nothing on a small one", () => {
    expect(strengthenActive(true, 96)).toBe(true);
    expect(strengthenActive(false, 96)).toBe(false);
    expect(strengthenActive(true, 48)).toBe(false);
  });
});
