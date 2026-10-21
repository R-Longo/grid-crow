import type { StitchMatrix } from "../convert/types";
import type { Stitch } from "./coords";
import { floodFill } from "./fill";
import { gestureStep, initialGesture } from "./gesture";
import type { GestureEffect, GestureState, Mode, PointerKind } from "./gesture";
import { History, applyEdit, makeAddColorEdit, makeEdit, makeRecolorEdit } from "./history";
import { countDifferences, isPaletteIndex, paintStitches, stitchesOnSegment } from "./paint";
import { addColorSlot, recolorSlot, stitchesOfSlot } from "./recolor";
import type { AddColorResult, RecolorResult } from "./recolor";

/** What a one-finger / left-button gesture does in Draw mode. */
export type Tool = "paint" | "fill" | "pick";

/** A pointer event as the page reports it (the session adds the current mode and Space state itself). */
export type PointerInput =
  | { type: "down"; id: number; kind: PointerKind; x: number; y: number; button: number }
  | { type: "move"; id: number; x: number; y: number }
  | { type: "up"; id: number }
  | { type: "cancel"; id: number };

/** What the screen has to do after an input. */
export type SessionEffect =
  | { type: "repaint"; stitches: Stitch[] }
  /** An action finished (or was undone/redone). `changed` = stitches that now differ from the converted chart;
   *  `stitches` = how many stitches this action itself touched. */
  | { type: "committed"; action: "paint" | "fill" | "recolor" | "addcolor" | "undo" | "redo"; changed: number; stitches: number }
  /** The eyedropper chose a color; painting continues with it. */
  | { type: "picked"; color: number }
  /** The painting color changed because the chart's palette did (an added color was undone). */
  | { type: "colorChosen"; color: number }
  | { type: "hover"; stitch: Stitch }
  | { type: "pan"; dx: number; dy: number }
  | { type: "pinch"; scale: number; cx: number; cy: number; dx: number; dy: number };

interface Stroke {
  /** The chart as it was before the stroke, so a cancelled stroke can be undone completely. */
  before: StitchMatrix;
  tool: Tool;
  touched: Stitch[];
  /** Paint: the last stitch drawn. Fill / pick: the stitch under the pointer now (null when off the chart). */
  last: Stitch | null;
}

/**
 * One editing session on one converted chart. No DOM, no canvas, no picture: it holds
 *  - `converted`: the chart exactly as the converter produced it. Never modified; Reset returns to it.
 *  - `matrix`: the editable chart, changed only by painting stitches with colors the chart already has.
 *
 * Painting only happens in Draw mode with a single pointer. A second finger, Pan mode, Space or the middle mouse
 * button never paint, and a stroke that is interrupted (second finger, the browser taking over the touch) is undone.
 */
export class EditorSession {
  readonly converted: StitchMatrix;
  matrix: StitchMatrix;
  active = 0;
  mode: Mode = "draw";
  tool: Tool = "paint";
  space = false;
  private history = new History();
  private gesture: GestureState = initialGesture;
  private stroke: Stroke | null = null;

  constructor(converted: StitchMatrix) {
    this.converted = converted;
    this.matrix = converted;
  }

  setActive(index: number): void {
    if (!isPaletteIndex(this.matrix, index)) throw new RangeError(`palette color ${index} does not exist`);
    this.active = index;
  }

  /** Stitches that differ from the converted chart. */
  changedCount(): number {
    return countDifferences(this.matrix, this.converted);
  }

  /**
   * Change the yarn color of a palette slot: every stitch that uses it changes with it, as one undo step. Refused (and
   * nothing changes) while a stroke is in progress, for a color that is not valid, or one another slot already has.
   */
  recolor(slot: number, hex: string): { result: RecolorResult; effects: SessionEffect[] } {
    if (this.busy) return { result: { ok: false, reason: "same" }, effects: [] };
    const result = recolorSlot(this.matrix, slot, hex);
    if (!result.ok) return { result, effects: [] };
    this.matrix = result.matrix;
    this.history.push(makeRecolorEdit(slot, result.from, result.to));
    const stitches = stitchesOfSlot(this.matrix, slot);
    return {
      result,
      effects: [
        { type: "repaint", stitches },
        { type: "committed", action: "recolor", changed: this.changedCount(), stitches: stitches.length },
      ],
    };
  }

  /** Add a new yarn color to the palette and paint with it from now on (one undo step). */
  addColor(hex: string): { result: AddColorResult; effects: SessionEffect[] } {
    if (this.busy) return { result: { ok: false, reason: "invalid" }, effects: [] };
    const result = addColorSlot(this.matrix, hex);
    if (!result.ok) return { result, effects: [] };
    this.matrix = result.matrix;
    this.history.push(makeAddColorEdit(result.slot, result.hex));
    this.active = result.slot;
    return {
      result,
      effects: [
        { type: "committed", action: "addcolor", changed: this.changedCount(), stitches: 0 },
        { type: "picked", color: result.slot },
      ],
    };
  }

  /** Throw away every edit. The converted chart itself is never touched. */
  reset(): void {
    this.gesture = initialGesture;
    this.stroke = null;
    this.matrix = this.converted;
    this.history.clear();
    if (this.active >= this.matrix.palette.length) this.active = this.matrix.palette.length - 1;
  }

  get canUndo(): boolean {
    return this.history.canUndo && !this.busy;
  }
  get canRedo(): boolean {
    return this.history.canRedo && !this.busy;
  }
  /** A stroke or touch gesture is in progress: undo and redo wait until it ends. */
  private get busy(): boolean {
    return this.stroke !== null || Object.keys(this.gesture.pointers).length > 0;
  }

  undo(): SessionEffect[] {
    return this.step("undo");
  }
  redo(): SessionEffect[] {
    return this.step("redo");
  }

  private step(direction: "undo" | "redo"): SessionEffect[] {
    if (this.busy) return [];
    const e = direction === "undo" ? this.history.popUndo() : this.history.popRedo();
    if (!e) return [];
    const r = applyEdit(this.matrix, e, direction);
    this.matrix = r.matrix;
    const effects: SessionEffect[] = [
      { type: "repaint", stitches: r.stitches },
      { type: "committed", action: direction, changed: this.changedCount(), stitches: r.stitches.length },
    ];
    // An added color that was just undone away can no longer be the color painting uses.
    if (this.active >= this.matrix.palette.length) {
      this.active = this.matrix.palette.length - 1;
      effects.push({ type: "colorChosen", color: this.active });
    }
    return effects;
  }

  /** Drop any gesture in progress, undoing a half-finished stroke (e.g. the view changed under the pointer). */
  cancelGesture(): SessionEffect[] {
    const effects = this.cancelStroke();
    this.gesture = initialGesture;
    return effects;
  }

  handle(input: PointerInput, toStitch: (x: number, y: number) => Stitch | null): SessionEffect[] {
    const ev =
      input.type === "down" ? ({ ...input, mode: this.mode, space: this.space } as const) : input;
    const r = gestureStep(this.gesture, ev);
    this.gesture = r.state;
    const out: SessionEffect[] = [];
    for (const e of r.effects) out.push(...this.run(e, toStitch));
    return out;
  }

  private cancelStroke(): SessionEffect[] {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return [];
    this.matrix = stroke.before;
    return stroke.touched.length ? [{ type: "repaint", stitches: stroke.touched }] : [];
  }

  private paint(stitches: Stitch[]): SessionEffect[] {
    const stroke = this.stroke;
    if (!stroke) return [];
    const r = paintStitches(this.matrix, stitches, this.active);
    if (r.changed.length === 0) return [];
    this.matrix = r.matrix;
    stroke.touched.push(...r.changed);
    return [{ type: "repaint", stitches: r.changed }];
  }

  private toStitches(indexes: number[]): Stitch[] {
    const cols = this.matrix.cols;
    return indexes.map((i) => ({ col: i % cols, row: (i / cols) | 0 }));
  }

  /** Record a finished action as one undo step. */
  private commit(label: "paint" | "fill", changed: Array<number | Stitch>, before: StitchMatrix): SessionEffect[] {
    const edit = makeEdit(label, changed, before, this.matrix);
    this.history.push(edit);
    return [{ type: "committed", action: label, changed: this.changedCount(), stitches: edit.index.length }];
  }

  private run(e: GestureEffect, toStitch: (x: number, y: number) => Stitch | null): SessionEffect[] {
    switch (e.type) {
      case "strokeStart": {
        const st = toStitch(e.x, e.y);
        this.stroke = { before: this.matrix, tool: this.tool, touched: [], last: st };
        if (!st) return [];
        return this.tool === "paint" ? [{ type: "hover", stitch: st }, ...this.paint([st])] : [{ type: "hover", stitch: st }];
      }
      case "strokeMove": {
        const stroke = this.stroke;
        if (!stroke) return [];
        const st = toStitch(e.x, e.y);
        const out: SessionEffect[] = [];
        if (st) {
          out.push({ type: "hover", stitch: st });
          if (stroke.tool === "paint") out.push(...this.paint(stroke.last ? stitchesOnSegment(stroke.last, st) : [st]));
        }
        stroke.last = st; // leaving the chart breaks the line; coming back starts a new one
        return out;
      }
      case "strokeEnd": {
        const stroke = this.stroke;
        this.stroke = null;
        if (!stroke) return [];
        if (stroke.tool === "paint") {
          if (this.matrix === stroke.before) return [];
          return this.commit("paint", stroke.touched, stroke.before);
        }
        // Fill and eyedropper act where the pointer is let go, so a second finger or a cancelled touch does nothing.
        if (!stroke.last) return [];
        if (stroke.tool === "pick") {
          this.active = this.matrix.cells[stroke.last.row][stroke.last.col];
          this.tool = "paint";
          return [{ type: "picked", color: this.active }];
        }
        const f = floodFill(this.matrix, stroke.last, this.active);
        if (f.changed.length === 0) return [];
        this.matrix = f.matrix;
        return [{ type: "repaint", stitches: this.toStitches(f.changed) }, ...this.commit("fill", f.changed, stroke.before)];
      }
      case "strokeCancel":
        return this.cancelStroke();
      case "pan":
        return [e];
      case "pinch":
        return [e];
    }
  }
}
