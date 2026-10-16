# GridCrow Conversion Engine: Architecture

Status: **design only.** No converter code exists yet. This document fixes the architecture so each stage can be built, tuned and replaced independently.

The engine's job: take an ordinary photograph, illustration, drawing or piece of digital art and produce a practical, recognizable single-crochet tapestry chart. It must not be "resize, then reduce colors." Resizing alone destroys small features (an eye, a whisker) and leaves speckle that nobody wants to crochet.

## 0. Non-negotiable invariants

1. The only color data in a chart is a **`StitchMatrix`**: a `Uint8Array` of palette indices, length `cols * rows`. One cell = one single crochet stitch = exactly one solid palette color.
2. No gradients, blended cells, partial cells, dithering, or image overlays inside the matrix, the editor canvas, or any export.
3. Every renderer (editor, PNG export, compare view) draws the chart from the matrix by palette lookup with `imageSmoothingEnabled = false`. The original photo is never drawn into a chart.
4. `validateMatrix()` runs at the end of every pipeline run and on every project load: length matches, every index is `< palette.length`, palette entries are unique. A failure is a bug, not a warning.
5. The pipeline is **deterministic**: same image + same settings gives a byte-identical matrix. No `Math.random()`; any randomness uses a seeded PRNG, with the seed stored in the project file.
6. Everything runs in the browser. No backend, no paid APIs. The engine runs in a Web Worker so the UI stays responsive.

## 1. Pipeline overview

```text
 File ──► 1 Preprocess ──► 2 Simplify ──► 3 Quantize ──► 4 Stitchify ──► 5 Cleanup ──► 6 Editable output
          (crop, scale,    (edge-         (≤ N solid     (grid-exact     (crochet-      (matrix + palette
          Lab)             preserving     colors)        matrix)         aware)         → editor)
                           smoothing)
                                  every stage can emit a debug snapshot ──► Compare / Stage-viewer UI
```

Each stage is a **pure function** `(input, config) => output` with typed-array inputs and outputs. Only Stage 1 touches the DOM (decode and canvas). This is what lets us improve one stage without touching the others.

## 2. Proposed folder layout

```text
src/engine/
├─ types.ts              StitchMatrix, Palette, ConversionConfig, StageSnapshot
├─ config.ts             all thresholds and presets, documented, in one place
├─ pipeline.ts           orchestrator: runs stages in order, collects snapshots, validates
├─ geometry.ts           gauge + template → cols, rows, physical size, cell aspect, crop rect
├─ stages/
│  ├─ preprocess.ts      decode (EXIF-aware), crop, resample to working resolution, to Lab
│  ├─ simplify.ts        edge-preserving smoothing (swappable implementations)
│  ├─ quantize.ts        weighted k-means in Lab, palette merge, color rescue
│  ├─ stitchify.ts       working-res palette image → stitch matrix (footprint voting)
│  └─ cleanup.ts         connected components, importance scoring, merge, outline smoothing
├─ color/
│  ├─ lab.ts             sRGB ↔ Lab
│  └─ deltaE.ts          color distance (ΔE76 first; CIEDE2000 only if needed)
├─ util/
│  ├─ connectedComponents.ts
│  ├─ prng.ts            seeded generator
│  └─ validate.ts        validateMatrix()
└─ worker/
   └─ convert.worker.ts  runs the pipeline off the main thread, reports progress, supports cancel
src/components/compare/  CompareView, StageViewer (UI only; reads snapshots)
```

`geometry.ts` (grid size from gauge and finished size) is already built. The crop-frame math is added in Stage 3a along with the rest of the engine (see section 7).

## 3. Core types (design sketch)

```ts
interface StitchMatrix {
  cols: number;                 // stitches per row
  rows: number;                 // number of rows
  cells: Uint8Array;            // palette index per stitch, row-major, length cols*rows
}

interface PaletteColor { id: number; hex: string; lab: [number, number, number]; }
type Palette = PaletteColor[];  // length ≤ user's maximum colors

interface ConversionConfig {
  orientation: Orientation; sizeId: FinishedSizeId;     // from the setup screen (gauge is fixed: standard worsted)
  maxColors: 4 | 6 | 8 | 10;
  cleanup: "off" | "gentle" | "standard" | "strong";    // preset into config.ts thresholds
  seed: number;
}

interface StageSnapshot {        // for compare/debug UI; never exported
  name: "crop" | "simplified" | "quantized" | "stitched" | "cleaned";
  width: number; height: number;
  rgba: Uint8ClampedArray;
}
```

Intermediate stages may hold float Lab data internally. Only `StitchMatrix + Palette` ever leave the engine as chart data.

## 4. Stage specifications

### Stage 1: Preprocess (composition and physical proportion)

- Decode with `createImageBitmap(file, { imageOrientation: "from-image" })` so phone photos are not rotated wrongly.
- Compute the **crop rectangle from physical dimensions, not pixels.** The finished piece is `cols / stitchesPerInch` wide and `rows / rowsPerInch` tall; the crop uses exactly that aspect ratio. The user previews and nudges the crop inside this fixed frame (pan/zoom). Default is a centered "cover" crop.
- Crochet stitches are not square. At the standard worsted gauge each cell is about 1.125:1 (0.25 in wide by 0.222 in tall, so slightly wider than tall). To avoid distorting the subject, resample the crop to a **working resolution** of `cols·Sx` by `rows·Sy`, where `Sx:Sy` approximates the physical cell aspect. Every stitch then owns an `Sx × Sy` footprint of working pixels.
- Working resolution is expressed in stitches, not source pixels, so results do not depend on how big the upload is. Use stepped downscaling (repeated halving) before the final resample so large photos don't alias.
- Transparent PNGs are composited onto a neutral background before processing (background choice is an open question, see section 9).
- Convert to CIE Lab floats for every later stage (perceptually even distances).

### Stage 2: Simplify (details, texture, gradients, noise)

Goal: flatten photographic texture and gradients into coherent regions while keeping the edges that define shapes.

- **Edge-preserving smoothing** on the Lab working image. Starting implementation: an iterated **bilateral filter** (2 to 3 passes). Its spatial radius is defined in *stitch units* so the effect scales with grid size, and its range sigma (about 10 to 20 ΔE, to be tuned) controls how strongly similar colors are flattened while strong edges stay put.
- Behind a small `Simplifier` interface so we can swap in alternatives and compare: anisotropic Kuwahara (a more painterly flattening, often good for crochet), mean-shift, or guided filter.
- Optional mild local contrast boost after smoothing, so flat regions stay separable when quantized.
- Also compute an **edge/detail map** (gradient magnitude on the original-detail Lab image) and carry it forward. Stages 3 and 5 use it to decide what is important.

### Stage 3: Color quantization (≤ 4, 6, 8, or 10 solid colors)

- **Weighted k-means in Lab** with deterministic initialization (k-means++ using the seeded PRNG, or farthest-point).
- Plain k-means starves small but important colors: a dark pupil is a few pixels and gets absorbed into the surrounding brown. Mitigations:
  - sample weights boosted by the Stage 2 detail map (high-contrast edge pixels count more);
  - a **color-rescue pass**: after clustering, look for a tight group of pixels with high residual error (poorly represented by any palette color) and, if it is large and distinct enough, swap it in for the least valuable cluster.
- Merge palette entries closer than a minimum ΔE (no two near-identical yarns). The limit is a **maximum**: fewer colors is a valid result.
- No dithering, ever.
- Output: `Palette` (hex + Lab, ordered by usage) plus a palette-index image at working resolution.

### Stage 4: Stitch conversion (exact grid)

- The matrix dimensions come straight from `geometry.ts` (gauge × size template): no rounding done here.
- Assign each stitch a color by **footprint voting** over its `Sx × Sy` working pixels, not by averaging colors and not by taking a single sample:
  - center-weighted vote across the palette indices in the footprint;
  - **minority boost**: a high-contrast color covering about 30 to 35% of the footprint (tunable) wins over the majority, so thin dark lines and small features survive;
  - ties break toward the more contrasting color.
- Output: `StitchMatrix` (the "before cleanup" version is kept as a snapshot).

### Stage 5: Crochet-aware cleanup

Works on the matrix and uses the Stage 2 detail map (resampled to the grid) to know what matters. Deterministic and iterative, with a few bounded passes.

1. **Connected-component labeling** (4-connectivity) of same-color regions.
2. **Importance score** per component, combining:
   - contrast (mean ΔE to surrounding stitches);
   - enclosure (fully surrounded by one other region, like an eye or a button);
   - shape (thin, long, high-contrast components such as whiskers, outlines, or letters);
   - overlap with the detail map (sits on a real edge in the original);
   - area (small is not automatically unimportant);
   - mild centrality bias.
3. **Protect, don't purge.** A small component is kept if its importance clears the protection threshold. Example: a 2-stitch dark region enclosed by a lighter one with high contrast is almost certainly an eye.
4. **Merge** unprotected components smaller than `minRegionStitches` into the neighbor with the longest shared boundary (ties: smallest ΔE).
5. **Isolated-stitch reduction:** 1-stitch components are absorbed into the dominant neighbor unless protected.
6. **Outline smoothing:** flip a boundary stitch only when most of its neighbors agree on another color (for example ≥ 5 of 8), the flip shortens the boundary, and the stitch is not protected. At most one or two passes, so outlines are tidied rather than melted.
7. Palette colors that end up unused are dropped.

All thresholds live in `config.ts` as named presets (`off`, `gentle`, `standard`, `strong`) scaled by grid area, with each value documented. The editor's cleanup tool reuses this same stage.

### Stage 6: Editable output

The engine returns `{ matrix, palette, dimensions, gauge, config, seed, engineVersion }` plus snapshots for the compare view. The editor opens on the matrix. Everything after this point is stitch-level human editing, with an undo stack that starts at the converted result. This is also exactly what is saved in a GridCrow project file (Stage 5 of the build plan).

## 5. Original vs. chart comparison

Goal: let the user judge whether the features that matter survived.

- **Side by side:** the cropped original (the exact framing the converter used) next to the chart rendered from the matrix at true stitch aspect, locked to the same pan and zoom.
- **Blink toggle** and a **swipe slider** between the two. These are viewing aids only: they live in the UI, are never stored in the matrix, and never appear in any export. (This keeps the "no overlays" rule intact.)
- Later idea, not scheduled: a "possible lost details" marker showing places where the original had strong small features that cleanup removed, so the user can restore them with the pencil.
- A developer-facing **stage viewer** shows the snapshots (crop, simplified, quantized, stitched, cleaned) so each stage can be tuned independently. It ships behind a dev flag.

## 6. Testing and tuning

- **Invariant tests:** valid matrix, palette size ≤ max, indices in range, every stitch single-colored.
- **Determinism test:** the same input produces an identical matrix hash.
- **Synthetic fixtures:** smooth gradient (must band into clean regions, no speckle), noise (must not survive as speckle), a 2×2 dark dot in a light field (must survive as an "eye"), a 1-px line (must survive when contrast is high), a fully flat image (must not crash).
- **Property tests for cleanup:** protected cells are never changed; output never introduces a color absent from the palette.
- **Fidelity metrics** for tuning: mean ΔE between the original downsampled to the grid and the chart; count of isolated stitches before/after; number of components; detail survival rate on a labeled sample set.
- **Sample gallery:** a small set of varied test images (pet photo, portrait, line drawing, flat illustration, painterly art, logo) used for visual tuning before each stage is signed off.
- Test runner: **Vitest** as a dev-only dependency (nothing is added to the shipped bundle). Subject to your approval.

## 7. How this fits the staged plan

| Stage | Scope |
|---|---|
| 1 (done, awaiting your review) | Structure, theme, setup screen, PWA |
| 2 (built) | One standard worsted gauge and six finished sizes in `src/config/`; `geometry.ts` computes the stitch grid for portrait and landscape; the setup screen shows finished size and grid. Cell aspect and crop-frame math follow in 3a |
| 3a | Engine skeleton (`types`, `config`, `pipeline`, worker), Stage 1 preprocess with crop preview UI, Stage 3 quantize, Stage 4 stitchify, `validateMatrix`, stage viewer. An internal checkpoint to prove the plumbing, not the finished converter |
| 3b | Stage 2 simplify (bilateral first, alternatives compared on the sample gallery) |
| 3c | Stage 5 cleanup with importance scoring and protection, presets, **Compare view** |
| 4 | Stitch editor (pencil, eraser, fill, palette, zoom, pan, grid lines, undo/redo, cleanup tool, download) |
| 5 | PNG and project-file export, reopening projects, Netlify prep |

Each sub-stage ends with your review before the next begins, as agreed.

## 8. Performance

Grids are small (from 24 × 36 up to 96 × 144 stitches, or 128 × 108 in landscape). The working image is a few hundred thousand pixels at most. Bilateral filtering and k-means at that size run comfortably in a Web Worker on a phone. Target: a conversion in a couple of seconds on a mid-range phone, with a progress indicator and cancel.

## 9. Open decisions (need your call)

1. **Chart cell shape.** Should the editor and chart show cells at their *true stitch aspect* (slightly wider than tall, about 1.125:1), so the chart looks like the finished piece? Or perfect squares for easy counting? Recommendation: true aspect, because the conversion preserves physical proportions and the chart then matches the crocheted result.
2. **Cleanup exposure.** Recommendation: no extra setting on the setup screen. The converter applies the "standard" preset by default, and the editor offers Gentle/Standard/Strong when re-running cleanup.
3. **Transparent images.** Composite onto white, onto the darkest palette color, or ask? Recommendation: white by default.
4. **Test images.** A handful of your own sample images (including the cat from your mockup) for tuning.
5. **Vitest** as a dev-only dependency for the tests above.
6. **Stage 3 split** into 3a / 3b / 3c with a review after each.

(V1 supports one standard worsted gauge only, so the earlier DK gauge question no longer applies.)


## Status: frozen (October 2026)

The production converter in `src/engine/convert/` is frozen. No further experimental changes go into it.
Detail-preservation experiments (line art, hybrid, simplification) are parked in `src/engine/research/`
and documented in [`research/README.md`](research/README.md). Bug fixes are still allowed, with a note here.
