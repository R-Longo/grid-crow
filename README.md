# GridCrow

Turn any image into a tapestry crochet grid. Free, private, runs entirely in the browser.

**Current status (October 2026): Stages 1-3 approved; Stage 4A (editable stitch canvas) is approved; Stage 4B (fill, eyedropper, undo/redo) is approved and deployed from GitHub; Stage 4C (unsaved-edit protection, reliability tests) is built and awaiting review. Stage 5 is export only (a flat grid image; no saving or re-importing).** Earlier: Stage 1 complete, plus the Stage 2 gauge/size calculations (setup screen, PWA config, standard worsted gauge, six finished sizes, stitch-grid math).
The "Create My Crochet Grid" button is intentionally not connected yet.

**V1 uses one standard gauge:** worsted weight #4, 5 mm hook, 16 stitches × 18 rows = 4 inches. There is no yarn, hook, or proportion selector.

## Staged plan

| Stage | Scope |
|---|---|
| 1 | Structure, theme, setup screen, PWA (built) |
| 2 | Standard worsted gauge, orientation, six finished sizes, grid and dimension display (built) |
| 3a / 3b / 3c | Conversion engine: pipeline + preprocess/quantize/stitchify, then simplify, then crochet-aware cleanup + original-vs-chart compare |
| 4 | Stitch editor |
| 5 | Exports, project reopening, Netlify prep |

The conversion engine design is in [`docs/CONVERSION_ENGINE.md`](docs/CONVERSION_ENGINE.md).

## Commands

```bash
npm install        # once
npm run dev        # local dev server (service worker is disabled in dev)
npm run typecheck  # TypeScript check
npm run build      # production build into dist/
npm run preview    # serve dist/ locally (service worker is active here)
```

## Folder structure

```text
gridcrow/
├─ public/
│  ├─ manifest.webmanifest   PWA manifest
│  ├─ sw.js                  hand-written service worker (app shell cache)
│  ├─ favicon.png
│  ├─ brand/mascot.png       mascot tile, cropped from the supplied brand board (provisional, low-res)
│  └─ icons/                 PWA icons made from the same crop (provisional)
├─ src/
│  ├─ main.tsx               entry; registers the service worker in production
│  ├─ App.tsx
│  ├─ types.ts               shared setup types
│  ├─ config/
│  │  ├─ gauge.ts            THE standard gauge (16 sts × 18 rows per 4 in). Edit here to change it
│  │  ├─ sizes.ts            the six finished sizes (portrait width × height, inches)
│  │  └─ options.ts          choices shown on the setup form
│  ├─ engine/geometry.ts     grid math: size + orientation + gauge → columns × rows
│  ├─ components/
│  │  ├─ Icon.tsx            small inline SVG icon set (no icon library)
│  │  ├─ Header.tsx          mascot, wordmark, tagline, How-To
│  │  ├─ HowTo.tsx           5-step panel (closes on Escape / outside click / X)
│  │  ├─ UploadZone.tsx      drag-and-drop, browse, type check, local preview
│  │  ├─ OptionGroup.tsx     accessible segmented radio control
│  │  ├─ SizeSummary.tsx     finished size, stitch grid, gauge note, tension note
│  │  └─ SetupScreen.tsx     upload + settings + primary button
│  ├─ lib/registerServiceWorker.ts
│  └─ styles/
│     ├─ tokens.css          design tokens (palette, type, spacing)
│     └─ global.css          layout and component styles
├─ index.html, vite.config.ts, tsconfig.json, package.json
```

## Stage 1 testing checklist

1. `npm run dev`, open the URL shown.
2. **Upload:** drag a PNG, JPG, or WebP onto the dashed box. A preview and its pixel size appear. Try "Choose a different image" and "Remove image". Drop a GIF or PDF: you should see a friendly error.
3. **Controls:** there are only Orientation, six finished sizes, and Maximum Yarn Colors. Defaults are Portrait, 12 × 16 in, 6 colors. Switching to Landscape reverses each size's width and height, and the stitch grid below the sizes recalculates (for example 6 × 8 portrait is 24 × 36; 8 × 6 landscape is 32 × 27).
4. **Button:** disabled with no image; enabled after upload. Clicking shows the "Stage 1 preview" note.
5. **How-To:** opens and closes; Escape and clicking elsewhere close it.
6. **Responsive:** narrow the window (or use device mode). Controls stack, buttons stay at least 44 px tall, no sideways scrolling.
7. **Keyboard:** Tab through everything; a gold focus ring should always be visible. Arrow keys move within each option group.
8. **PWA:** `npm run build && npm run preview`. In Chrome DevTools > Application: manifest has no errors, the service worker is "activated", and "Offline" mode still loads the page after one visit. An install icon appears in the address bar.

## Notes for later stages

- Gauge lives in `src/config/gauge.ts` and the six sizes in `src/config/sizes.ts`. Sizes are approximate and depend on individual crochet tension.
- The mascot and PWA icons are cropped from the supplied brand board, so they are small and a little soft at 512 px. Replace `public/brand/mascot.png` and `public/icons/*` with clean exports (transparent PNG or SVG) when you have them.
- Netlify: `netlify.toml` is already in place (build command `npm run build`, publish directory `dist`, no-cache header on the service worker). Connect the GitHub repo in Netlify and it deploys with no extra settings. There is no client-side router, so no SPA redirect is needed.

## Tests

`npm test` runs Vitest (no browser needed). Stage 2 tests cover all 12 size × orientation
combinations, the gauge, GridSpec contents, and independent setup selections.
Sizing lives in `src/engine/geometry.ts` (`buildGridSpec`); gauge in `src/config/gauge.ts`.

## Stage 3: image-to-stitch conversion

Code lives in `src/engine/convert/` (pure TypeScript, no DOM, fully tested):

| File | Job |
|---|---|
| `crop.ts` | Crop rectangle in the finished tapestry's **physical** aspect ratio (never cols ÷ rows) |
| `resample.ts` | Transparency → white, then area-averaged resize of the crop |
| `smooth.ts` | Edge-preserving (bilateral) smoothing in Lab |
| `quantize.ts` | Deterministic palette selection (seeded k-means in Lab, no randomness) |
| `stitchify.ts` | One palette color per stitch (contrast-aware vote over each stitch footprint) |
| `cleanup.ts` | Merges stray 1–2 stitch regions, but protects small high-contrast details (eyes) |
| `convert.ts` | The pipeline: `convertRaster(raster, crop, gridSpec) → StitchMatrix` |
| `validate.ts` | `validateMatrix(matrix, gridSpec)` |
| `decode.ts`, `run.ts`, `worker.ts` | Browser file validation/decoding and background worker |

The matrix (`StitchMatrix.cells[row][col]` → palette index) is the source of truth; `ChartView` only draws it.

Try it: `npm run dev`, then upload `test-images/geometric-shapes.png` (flat colors, easy to judge).

## Stage 3 fix: preserving small distinctive colors

**Cause.** The blue eyes were lost in *palette selection*. Preprocessing, stitch sampling and cleanup only made it worse at the margin. A small saturated color (about 175 of 207k working pixels in the kitten) spreads over many tiny histogram bins, so k-means never gave it a slot. Stitch voting could then lose to the dark pupil.

**Changes.** (1) *Salient-color rescue* (`quantize.ts`): after k-means, a small, hue-distinct, connected patch of color (≥0.03% of area, ≥18 connected pixels, clearly different in hue from every palette color) can take a slot from the cheapest near-duplicate neutral. At most 2 rescues at 8–10 colors, 1 at 4–6. The color is a real average of the image's own pixels, never boosted. (2) *Hue-aware vote boost* (`stitchify.ts`): a stitch whose footprint holds a distinct hue is no longer outvoted by dark neighbors.

**Limits.** A feature much smaller than one stitch cannot survive. At 4 colors the gray slots are worth more than the blue, so the blue is dropped. Muted blue stays a dull steel blue. Random speckle is deliberately not preserved. Colors and the max-colors limit stay deterministic and respected.

## Stage 3 refinement: thin lines, busy artwork, distinctive colors

Where detail was actually lost (measured per stage on a minimalist line-art card; ink = anything clearly different from the background):

| Stage | Effect on thin linework |
|---|---|
| Downsample (area average) | Lines thinner than a pixel become pale blends. This is inherent to the image. |
| Edge-preserving smoothing | Loses about 15% of faint pixels. Turning it off made lines thicker than the source (area ratio 1.26), so it stays. |
| Palette selection | Gives a slot to the line color when it has mass; small distinct colors are handled by the color rescue. |
| **Stitch vote** | **The main loss.** A line a third of a stitch wide never wins a majority, so about half the ink vanished (recall 0.38 at 6 colors, 0.30 at 10). |
| Cleanup | Small further loss (about 5%). Diagonal lines are already protected by the contrast rule. |

Changes (`stitchify.ts`, one deterministic pass, no new colors, every stitch still one palette color):
1. **Reference color.** A stitch is compared with the dominant color of its 3×3 neighbourhood instead of the neighbourhood average, which the line itself had diluted.
2. **Thin-line coverage rule.** In a calm field only (the dominant color fills at least 65% of the neighbourhood), the share of the stitch lying on the way from the background to a strongly contrasting color decides the stitch. A line a quarter of a stitch wide becomes one stitch of line. It never fires in busy two-tone artwork, and never next to a stitch that already won that color, so lettering and flat shapes are not thickened.
3. **Gap closing.** Two line stitches two apart (straight or a knight's move) with no line stitch between them get the gap filled, only on a background stitch and only if the picture shows some of that color there. A gap between two parallel lines has no such evidence and stays open.
4. **Busy-area noise.** A stitch in a busy area that won with less than half its footprint and has no neighbour of its color joins the color most of its neighbours share. Calm-field stitches (eyes, thin lines) are never touched.

Physical limits: a line thinner than a stitch can only be drawn as one full stitch (about 1/4 in), so thin lines come out heavier than in the source. At 64 stitches across (16 in) a hatched sunflower head or a 4-stitch letter cannot keep all its detail. Detail finer than one stitch is never invented.

## Proof of concept: illustration (line-art) conversion

`src/engine/convert/illustration.ts` is a separate pipeline, **not wired into the app**. It shares the sizing engine and `StitchMatrix` with the photo converter and nothing else: it works at 8 px per stitch with no smoothing, takes the artist's flat colors (anti-aliasing blends are not colors), measures how much ink falls in each stitch, and draws a line thinner than a stitch as one stitch per crossing (a local maximum across the line), so lines stay connected and parallel lines more than a stitch apart stay apart. Lines closer than a stitch merge: the stitch is the limit.

It suits sparse line art on a plain background. It is worse than the photo converter on shaded or dense artwork (the crow illustration, the tarot card), so it must be a user choice or a suggestion, never silent.
