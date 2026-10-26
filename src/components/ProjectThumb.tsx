import { useEffect, useRef } from "react";
import type { PackedMatrix } from "../engine/project/format";
import { aspectOf, gaugeOf } from "../engine/gauge";

/** A tiny picture of a saved chart: one pixel per stitch, drawn big and sharp. */
export function ProjectThumb({ chart }: { chart: PackedMatrix }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    el.width = chart.cols;
    el.height = chart.rows;
    const rgb = chart.palette.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    const img = ctx.createImageData(chart.cols, chart.rows);
    for (let i = 0; i < chart.cells.length; i++) {
      const c = rgb[chart.cells[i]] ?? [255, 255, 255];
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [chart]);
  return (
    <canvas
      ref={ref}
      className="projects__thumb"
      aria-hidden="true"
      data-testid="project-thumb"
      style={{ aspectRatio: `${chart.cols * aspectOf(gaugeOf(chart))} / ${chart.rows}` }}
    />
  );
}
