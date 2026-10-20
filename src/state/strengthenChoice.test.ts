import { describe, expect, it } from "vitest";
import { strengthenActive, strengthenOffered } from "./strengthenChoice";

describe("strengthen choice", () => {
  it("is offered from 12 x 16 (48 stitches across) upward, not on the two smallest sizes", () => {
    expect(strengthenOffered(24)).toBe(false);
    expect(strengthenOffered(32)).toBe(false);
    expect(strengthenOffered(40)).toBe(false); // 8 x 10 turned sideways
    expect(strengthenOffered(48)).toBe(true);
    expect(strengthenOffered(64)).toBe(true);
    expect(strengthenOffered(96)).toBe(true);
  });
  it("applies only when ticked and offered; a tick left over from a bigger size does nothing on a small one", () => {
    expect(strengthenActive(true, 96)).toBe(true);
    expect(strengthenActive(false, 96)).toBe(false);
    expect(strengthenActive(true, 32)).toBe(false);
  });
});
