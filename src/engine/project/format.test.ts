import { describe, expect, it } from "vitest";
import { buildGridSpec } from "../geometry";
import { makeBlankMatrix } from "../blank";
import { PROJECT_FORMAT, ProjectFormatError, backupFileName, cleanName, packMatrix, parseProjectJson, projectToJson, unpackMatrix } from "./format";
import type { ProjectData } from "./format";

function sample(): ProjectData {
  const settings = { orientation: "portrait" as const, sizeId: "6x8" as const, maxColors: 6 as const };
  const g = buildGridSpec(settings);
  const m = makeBlankMatrix(g.cols, g.rows);
  m.cells[3][4] = 2;
  const cur = packMatrix(m);
  return {
    id: "a", name: "My cat", kind: "blank", createdAt: 1, updatedAt: 2, settings, strengthen: false,
    crop: { zoom: 1, cx: 0.5, cy: 0.5 }, aspect: 1, converted: packMatrix(makeBlankMatrix(g.cols, g.rows)), current: cur, progress: 5,
    image: { name: "cat.png", type: "image/png", bytes: new Uint8Array([1, 2, 3, 250, 255]) },
  };
}

describe("project file", () => {
  it("round-trips exactly", () => {
    const p = sample();
    const back = parseProjectJson(projectToJson(p), "new");
    expect(back.id).toBe("new");
    expect(back.name).toBe("My cat");
    expect(back.settings).toEqual(p.settings);
    expect(Array.from(back.current.cells)).toEqual(Array.from(p.current.cells));
    expect(back.current.palette).toEqual(p.current.palette);
    expect(Array.from(back.image!.bytes)).toEqual([1, 2, 3, 250, 255]);
    expect(back.progress).toBe(5);
    const m = unpackMatrix(back.current);
    expect(m.cells[3][4]).toBe(2);
    expect(m.palette[2].r).toBe(0xd6);
  });
  it("refuses things that are not a project", () => {
    expect(() => parseProjectJson("nope", "x")).toThrow(ProjectFormatError);
    expect(() => parseProjectJson(JSON.stringify({ format: "other" }), "x")).toThrow(/isn't a GridCrow/);
    const j = JSON.parse(projectToJson(sample()));
    j.version = 99;
    expect(() => parseProjectJson(JSON.stringify(j), "x")).toThrow(/different version/);
  });
  it("refuses damaged or hostile data", () => {
    const base = () => JSON.parse(projectToJson(sample()));
    const bad = (mut: (j: any) => void) => {
      const j = base(); mut(j);
      return () => parseProjectJson(JSON.stringify(j), "x");
    };
    expect(bad((j) => (j.settings.sizeId = "99x99"))).toThrow(ProjectFormatError);
    expect(bad((j) => (j.settings.maxColors = 7))).toThrow(ProjectFormatError);
    expect(bad((j) => (j.current.cols = 5))).toThrow(/does not match/);
    expect(bad((j) => (j.current.palette = ["red"]))).toThrow(/colors are not valid/);
    expect(bad((j) => (j.current.palette = j.current.palette.concat(j.current.palette[0])))).toThrow(/repeats/);
    expect(bad((j) => (j.current.cells = "AAAA"))).toThrow(/do not match/);
    expect(bad((j) => (j.current.cells = "!!!!"))).toThrow(/damaged/);
    expect(bad((j) => (j.crop.zoom = 50))).toThrow(/crop/);
    expect(bad((j) => (j.image.type = "text/html"))).toThrow(/picture/);
    expect(bad((j) => (j.progress = 1e9))).toThrow(/progress/);
    expect(bad((j) => (j.aspect = "wide"))).toThrow(/proportions/);
  });
  it("rejects a stitch that uses a color that does not exist", () => {
    const p = sample();
    p.current.cells[0] = 200;
    expect(() => parseProjectJson(projectToJson(p), "x")).toThrow(/color that does not exist/);
  });
  it("cleans names and file names", () => {
    expect(cleanName("  Hi\n<b>there</b>  ")).toBe("Hi <b>there</b>");
    expect(cleanName("", "Fallback")).toBe("Fallback");
    expect(cleanName("x".repeat(200))).toHaveLength(80);
    expect(backupFileName("My Cat! (v2)")).toBe("gridcrow-my-cat-v2.gridcrow");
    expect(backupFileName("###")).toBe("gridcrow-project.gridcrow");
    expect(PROJECT_FORMAT).toBe("gridcrow-project");
  });
});
