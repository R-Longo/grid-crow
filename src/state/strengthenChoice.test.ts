import { describe, expect, it } from "vitest";
import { strengthenActive, strengthenOffered } from "./strengthenChoice";

describe("strengthen choice", () => {
  it("is offered from 12 x 16 upward and on the tall 9 x 16, not on the small sizes", () => {
    expect(strengthenOffered(24, 32)).toBe(false); // 6 x 8
    expect(strengthenOffered(32, 45)).toBe(false); // 8 x 10
    expect(strengthenOffered(40, 36)).toBe(false); // 8 x 10 turned sideways
    expect(strengthenOffered(36, 72)).toBe(true); // 9 x 16 tall
    expect(strengthenOffered(64, 41)).toBe(true); // 9 x 16 sideways
    expect(strengthenOffered(48, 54)).toBe(true); // 12 x 12
    expect(strengthenOffered(48, 72)).toBe(true);
    expect(strengthenOffered(96, 100)).toBe(true);
  });
  it("applies only when ticked and offered", () => {
    expect(strengthenActive(true, 96, 100)).toBe(true);
    expect(strengthenActive(true, 36, 72)).toBe(true);
    expect(strengthenActive(false, 96, 100)).toBe(false);
    expect(strengthenActive(true, 32, 45)).toBe(false);
  });
});
