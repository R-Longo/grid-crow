# Detail-preservation research (parked)

Status: **research only. Not used by the app.** The production converter (`src/engine/convert/`) is frozen.
Experimental code lives in `src/engine/research/` and is not imported by anything in the app.

## Question
Can GridCrow do better on thin linework and illustrations (tarot cards, engravings, line drawings) than the
photo converter, without hurting photographs?

## What was built (all in `src/engine/research/`)
| File | What it is |
|---|---|
| `illustration.ts` | "Line art" converter: works at 8 px per stitch, no smoothing, literal flat colors, per-stitch ink coverage, one bold stitch per line crossing. `analyzeIllustration()` exposes the coverage data. |
| `hybrid.ts` | Photo result as the base; line-art stitches added back only where the picture is a drawing, the photo path left field color, the ink already exists in the palette, and the stitch extends existing linework without filling gaps. |
| `simplify.ts` | Line-or-tone simplification: bold lines in sparse areas, two flat mid-tones in dense hatching. |
| `illustration.test.ts` | 15 tests for the line-art converter (they pass). |

## Findings
1. **The main loss in the photo path is the per-stitch vote**, not smoothing or cleanup: a line about 1/3 of a stitch wide never wins the majority. The refinements already shipped in the photo converter (thin-line coverage rule, gap bridging) came from this.
2. **Physical limit:** at 4 stitches/inch, 16x20 is 64 x 90 stitches. A tarot card's artwork gets about 40 stitches across, so a face is roughly 10 x 10. Lines closer together than a stitch merge. No algorithm fixes that.
3. **Stand-alone line art** wins only on sparse dark linework on a plain background (sketch girl, B&W tarot, line cup). It is clearly worse on photos, paintings, shaded art and dense engravings.
4. **Hybrid** restores ray structure on the minimalist sun card (stitch recall 71% to 75% at 24x32) and leaves flat illustrations and photos unchanged where its gate is off. It is not safe yet: the on/off gate is leaky (it switched on for the latte, adding specks), unstable across sizes (sketch girl on at 24x32, off at 16x20), thresholds were tuned on the same images, and yarn color changes rose 10-45% when it ran. The sun's face did not improve.
5. **Simplification** gives cleaner shapes but loses the face (engraving sun, color tarot). Not a win yet.

## To revisit this
- Collect many more varied illustration samples, and add a quality measure that is not tuned on the same images (held-out set).
- Find a gate for "this is a drawing" that does not depend on hand-picked thresholds.
- Protect facial features (small dark marks inside a light disc) from any simplification.
- Product side: manual "Illustration / Line art" choice, plus a detail-density warning (see `docs/STAGE4_PLAN.md`, backlog).

## Reproducing
`scripts/` holds the harnesses (they expect the sample images as `.rgba` files; the originals as PNG are in `originals/`). `sheets/` has the side-by-side comparisons from each round, and `hybrid-results.json` the per-image metrics.
