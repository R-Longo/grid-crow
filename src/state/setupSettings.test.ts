import { describe, expect, it } from "vitest";
import { buildGridSpec } from "../engine/geometry";
import type { SetupSettings } from "../types";
import { settingsReducer } from "./setupSettings";
import type { SettingsAction } from "./setupSettings";

const start: SetupSettings = { orientation: "portrait", sizeId: "16x20", maxColors: 8 };

describe("independent selections", () => {
  it("changing orientation keeps size and max colors", () => {
    const next = settingsReducer(start, { key: "orientation", value: "landscape" });
    expect(next).toEqual({ orientation: "landscape", sizeId: "16x20", maxColors: 8 });
  });

  it("changing size keeps orientation and max colors", () => {
    const landscape = settingsReducer(start, { key: "orientation", value: "landscape" });
    const next = settingsReducer(landscape, { key: "sizeId", value: "6x8" });
    expect(next).toEqual({ orientation: "landscape", sizeId: "6x8", maxColors: 8 });
  });

  it("changing max colors keeps orientation and size", () => {
    const next = settingsReducer(start, { key: "maxColors", value: 4 });
    expect(next).toEqual({ orientation: "portrait", sizeId: "16x20", maxColors: 4 });
  });

  it("does not mutate the previous settings", () => {
    const copy = { ...start };
    settingsReducer(start, { key: "sizeId", value: "24x32" });
    expect(start).toEqual(copy);
  });
});

describe("no stale values after rapid changes", () => {
  it("the grid always matches the final selections", () => {
    const actions: SettingsAction[] = [
      { key: "sizeId", value: "6x8" },
      { key: "orientation", value: "landscape" },
      { key: "maxColors", value: 10 },
      { key: "sizeId", value: "24x32" },
      { key: "orientation", value: "portrait" },
      { key: "orientation", value: "landscape" },
      { key: "sizeId", value: "12x16" },
      { key: "maxColors", value: 4 },
      { key: "orientation", value: "portrait" },
      { key: "sizeId", value: "18x24" },
      { key: "orientation", value: "landscape" },
    ];
    let state = start;
    for (const a of actions) {
      state = settingsReducer(state, a);
      const g = buildGridSpec(state); // derived fresh from the latest state each time
      expect(g.sizeId).toBe(state.sizeId);
      expect(g.orientation).toBe(state.orientation);
      expect(g.maxColors).toBe(state.maxColors);
    }
    expect(state).toEqual({ orientation: "landscape", sizeId: "18x24", maxColors: 4 });
    const g = buildGridSpec(state);
    expect([g.cols, g.rows]).toEqual([96, 81]);
  });
});
