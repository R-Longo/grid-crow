import { describe, expect, it } from "vitest";
import { cellEdge, pointToStitch, stitchLabel } from "./coords";
import { labelStep, rowDirection, directionLabel, stripSpan, visibleLabels } from "./rulers";

const axis = (over: Partial<Parameters<typeof visibleLabels>[0]> = {}) => ({
  count: 96,
  size: 10,
  scroll: 0,
  view: 400,
  minGap: 22,
  ...over,
});

describe("labelStep", () => {
  it("prints every stitch when zoomed in and thins out when zoomed out", () => {
    expect(labelStep(30, 22)).toBe(1);
    expect(labelStep(12, 22)).toBe(2);
    expect(labelStep(5, 22)).toBe(5);
    expect(labelStep(2, 22)).toBe(20);
  });
});

describe("visibleLabels", () => {
  it("numbers stitches from the right: the last column is 1, the first is count", () => {
    const l = visibleLabels(axis({ count: 20, size: 30, view: 600 }));
    expect(l[0].n).toBe(20);
    expect(l[l.length - 1].n).toBe(1);
    expect(l.length).toBe(20);
  });
  it("centres each label on the stitch it names, matching the stitch lookup", () => {
    const layout = { cols: 96, rows: 144, cellW: 7.3, cellH: 8.2 };
    const labels = visibleLabels(axis({ count: 96, size: 7.3, scroll: 40, view: 300, minGap: 1 }));
    for (const lb of labels) {
      const s = pointToStitch(lb.pos + 40, 1, layout);
      expect(s && stitchLabel(s, 144, 96).stitch).toBe(lb.n);
    }
  });
  it("row labels: row 1 is at the bottom", () => {
    const l = visibleLabels(axis({ count: 144, size: 20, view: 144 * 20, minGap: 1 }));
    expect(l[l.length - 1].n).toBe(1);
    expect(l[0].n).toBe(144);
  });
  it("only returns what is on screen after scrolling and keeps number 1 when visible", () => {
    const l = visibleLabels(axis({ count: 96, size: 10, scroll: 560, view: 400 }));
    expect(l.every((x) => x.pos >= -10 && x.pos <= 410)).toBe(true);
    expect(l.some((x) => x.n === 1)).toBe(true);
    expect(l.some((x) => x.n === 96)).toBe(false);
  });
  it("marks multiples of ten as major", () => {
    const l = visibleLabels(axis({ minGap: 1, view: 960 }));
    expect(l.filter((x) => x.major).every((x) => x.n % 10 === 0)).toBe(true);
    expect(l.find((x) => x.n === 50)?.major).toBe(true);
  });
  it("is empty for degenerate input", () => {
    expect(visibleLabels(axis({ view: 0 }))).toEqual([]);
    expect(visibleLabels(axis({ size: 0 }))).toEqual([]);
  });
});

describe("stripSpan", () => {
  it("matches the drawn cell edges", () => {
    const s = stripSpan(7, 7.3, 15);
    expect(s.start).toBe(cellEdge(7, 7.3) - 15);
    expect(s.length).toBe(cellEdge(8, 7.3) - cellEdge(7, 7.3));
  });
});

describe("direction and status", () => {
  it("odd rows right to left, even rows left to right", () => {
    expect(rowDirection(1)).toBe("rtl");
    expect(rowDirection(2)).toBe("ltr");
  });
  it("direction wording", () => {
    expect(directionLabel(12)).toBe("left to right");
    expect(directionLabel(3)).toBe("right to left");
  });
});
