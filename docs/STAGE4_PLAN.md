# Stage 4 plan: the stitch editor

Status: **4A and 4B approved and built. 4C (reliability and unsaved-edit protection) built and awaiting review. Stage 5 is export only.**
Rules carried over: the production converter (`src/engine/convert/`) is frozen; the 139 existing tests must keep passing;
the experimental line-art / hybrid / simplification code stays in `src/engine/research/` and is not used; the visual design
stays as approved except for controls the editor genuinely needs (listed below); no new libraries; no deployment before review.

## 1. What exists today (inspected)

| Piece | Where | Relevant facts |
|---|---|---|
| The chart data | `src/engine/convert/types.ts` `StitchMatrix` | `{cols, rows, palette: PaletteColor[], cells: number[][]}`. `cells[row][col]` is a palette index; row 0 is the top, column 0 the left. Documented as the source of truth. |
| Chart rules | `src/engine/convert/validate.ts` `validateMatrix(m, spec)` | Checks dimensions against the `GridSpec`, palette size ≤ `maxColors`, colors in use ≤ `maxColors`, every index in range. Its header already says "used by editing in Stage 4". |
| Sizing | `src/engine/geometry.ts` `buildGridSpec`, `src/config/gauge.ts`, `sizes.ts` | Six sizes, portrait/landscape; 4 stitches/in x 4.5 rows/in. Largest chart: 24x32 in = 96 x 144 (or 128 x 108 landscape) = **13,824 stitches**. The editor will not recalculate any of this. |
| Where the chart lives | `src/components/SetupScreen.tsx` | `result` state `{matrix, crop, aspect}`. **Any change to file, crop, orientation, size or colors calls `invalidate()` and clears `result`.** Pressing "Create My Crochet Grid" again replaces it. Today that is harmless; once edits exist it would silently destroy them (see "Unsaved edits"). |
| The chart view | `src/components/ChartView.tsx` | One canvas drawn from the matrix at `cellW x cellH` (1/4 in x 1/4.5 in aspect), a separate grid-line canvas, an Original-compare canvas (reads the decoded bitmap, read-only), zoom slider 1-8 (zoom 1 fits the width), a palette list. It redraws the whole canvas whenever the matrix changes. **It has no pointer handling at all**; pan is the browser's native scrolling in `.chart__scroll`. |
| Converter | `convert/run.ts`, `worker.ts`, `convert.ts` | Runs only when "Create My Crochet Grid" is pressed. The source picture is a decoded `ImageBitmap` (`decode.ts`) that the chart only reads. |
| Styling | `src/styles/global.css` (`.chart__*`), `tokens.css` | Toolbar toggle buttons, checkbox, zoom slider and palette swatches already exist and will be reused. |
| Tests | 9 files, 139 tests, Vitest in Node (no DOM environment) | Pure logic is tested without a browser. The editor follows the same approach. |

## 2. Architecture

**Principle: one-way flow, matrix on top.**
```text
 pointer events ──► gesture machine ──► editing operations (pure) ──► new StitchMatrix ──► renderer (canvas)
                    (what is this          (paint, fill, sample,          ▲                  draws FROM the matrix,
                     gesture?)              undo, redo)                   │                  never writes to it
                                                                  history of cell diffs
```
- **The matrix is the only place colors live.** The canvas is a picture of it. The editor never reads pixels back from a canvas.
- **Editing is separate from rendering and conversion.** `src/engine/editor/` has no React, no canvas, and does not import
  anything from `convert/` except types. `convert/` never imports the editor. An architecture test enforces both.
- **No re-conversion, ever, on an edit.** The editor has no access to the raster, the crop or `convertRaster`. The uploaded image is
  never passed to it, so it cannot be changed.
- **Edits only use existing palette indices.** There is no "add color". An edit is `(cell, paletteIndex)` with the index
  required to exist, so the palette size and the max-colors limit cannot be exceeded by construction, and `validateMatrix` is
  asserted after every operation in tests.
- **Palette entries are stable while editing.** A color that drops to zero stitches stays in the palette (greyed, count 0), so
  indices never shift and undo is exact. Unused entries are only dropped when exporting (Stage 5).
- **Strokes.** A drag collects the cells it touches (consecutive pointer positions are joined with a line, so a fast drag never
  leaves gaps) and applies them as one operation. In-progress strokes repaint only the changed cells; on release the stroke becomes
  one history entry. History entries store only `{cell, before, after}` for cells that actually changed.

Planned modules:
```text
src/engine/editor/                  pure, tested without a browser
  coords.ts      point <-> stitch mapping, zoom-around-a-point, display numbering (0-based inside, 1-based shown)
  paint.ts       paintCells, cellsOnSegment (gap-free drag), sampleColor            [4A: paint, 4B: sample]
  fill.ts        floodFill (4-connected, iterative, same-color region)               [4B]
  history.ts     push / undo / redo, one action per stroke or fill, size cap         [4B]
  gesture.ts     pointer state machine: idle / painting / panning / pinching         [4A, hardened in 4C]
src/state/editorState.ts            one reducer: current matrix, converted matrix (for reset), active color, tool, history
src/components/ChartView.tsx        extended in place: canvas painting, pointer wiring, selectable palette, status line
src/components/UnsavedGuard.tsx     leave/discard confirmation                                                          [4C]
```

## 3. Increments

### 4A: Editable stitch canvas
- Pick one of the existing palette colors (the palette list items become buttons); the selected color is shown clearly.
- Click or drag to recolor stitches, mouse and touch, directly in the matrix.
- Accurate zoom (slider as today, plus Ctrl/Cmd + wheel and pinch, anchored under the pointer), pan, and the existing grid-line toggle.
- Status line: selected color (swatch + hex) and the stitch under the pointer ("Stitch 12 · Row 34").
- No undo yet in 4A, so one safety control: **Reset to converted** (with confirmation).
- Not in 4A: fill, eyedropper, undo/redo, leaving-the-page protection.

**Pointer rules (decided here, hardened in 4C):**
| Input | Draw mode | Pan mode |
|---|---|---|
| Mouse left button | paints | pans |
| Mouse wheel | scrolls; Ctrl/Cmd + wheel zooms | same |
| Hold Space, or middle button, drag | pans | pans |
| One finger | paints | pans |
| Two fingers | always pans and pinch-zooms, never paints | same |
A second finger landing during a stroke **cancels that stroke and undoes any stitches it already changed**, so starting a pinch never leaves paint behind. `pointercancel` (the browser taking over a touch) does the same.

### 4B: Tools and undo history (built, awaiting review)
- Flood fill (4-connected region of the same color), eyedropper, undo/redo (toolbar buttons plus Ctrl/Cmd+Z, Shift+Z).
- One stroke = one action; one fill = one action; undo of either restores exactly the stitches it changed.
- Redo is cleared by a new edit. History is capped (500 actions / 1,000,000 changed stitches) and cheap because it stores diffs.
- Built as: Paint / Fill / Pick color tool buttons (Draw mode only), Undo / Redo buttons, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y. Fill and Pick act where the pointer is released; a second finger or cancel does nothing. Pick returns to Paint. Reset clears the history. Edits can only use existing palette indices.

### 4C: Reliability
- Coordinate-mapping tests across zoom levels, screen widths and scroll offsets (see section 4).
- Panning vs painting: gesture-machine tests plus real-browser checks with mouse and emulated touch.
- Undo/redo soundness after long strokes and large fills (property tests).
- Performance on the largest grids.
- **Unsaved edits:** a "leave this page?" warning while there are edits, and a discard confirmation before anything that would replace the edited chart (new "Create My Crochet Grid", changing file / crop / orientation / size / max colors, Reset to converted). Until Stage 5 (saving), edits live only while the page is open.

## 4. UI additions (everything else keeps the approved look)
1. Palette swatches become selectable (selected state uses the existing focus/pressed styling).
2. A Draw / Pan toggle in the existing chart toolbar (needed on touch, where one finger cannot both paint and scroll).
3. A one-line status text under the toolbar: selected color + stitch coordinates.
4. A "Reset to converted" button (4A), Undo / Redo and tool buttons (4B), a discard confirmation (4C).

## 5. Test strategy
| Layer | How | What it proves |
|---|---|---|
| Pure logic (Vitest, Node) | tables + property tests on `coords`, `paint`, `fill`, `history`, `gesture` | Mapping exact at zoom 1 / 2.25 / 8, widths 320 / 375 / 768 / 1440, with scroll offsets, high-DPI, edges and outside clicks (every one of the 13,824 stitch centers round-trips to its own stitch); drag has no gaps; fill region exact; random edit sequences: undo all = original, redo all = edited, `validateMatrix` clean, palette length and colors-in-use never grow; one stroke / fill = one undo step. |
| Gesture machine | synthetic pointer-event sequences | Mouse paints; touch paints in Draw, pans in Pan; two fingers never paint; second finger / cancel reverts the stroke; pointer up outside the canvas ends the stroke cleanly. |
| Architecture | file-scan test | `convert/` does not import the editor; the editor imports nothing that decodes, resamples or converts; `convertRaster` is never reachable from the editor. |
| Performance | Node timings on 96 x 144 and 128 x 108 | Full-grid fill, 500-action history (memory and undo time), long strokes; I report real numbers rather than asserting guesses. |
| Real browser (not part of `npm test`) | Chromium + Playwright run from this workspace, no new project dependency; mouse, emulated touch, pinch, and canvas repaint timing at 24x32 | Pointer and touch handling end to end. **Limit:** this is Chromium with emulated touch. I cannot test real iOS Safari or Android devices, so you will need to try it on a phone before approving 4C. |
| Regression | existing 139 tests, `tsc`, `npm run build` after every increment | Nothing else moved. |

## 6. Decisions needed
1. **Coordinate numbering shown to the user.** Internally 0-based, top-left. For display, should row 1 be the **bottom** row (how crochet charts are usually worked and read) or the **top** (matches what you see on screen)? Stitches count from the left either way. I recommend row 1 at the bottom, with the numbering in one function so it is easy to flip.
2. **Pan on touch.** Draw/Pan toggle plus two-finger pan/pinch (recommended), or the toggle only?
3. **Colors that reach zero stitches** stay in the palette (recommended, so undo is exact), or are removed immediately?
4. **Safety in 4A:** include "Reset to converted" now, since there is no undo yet (recommended)?
5. **Discard prompts (4C):** a small in-app confirmation using the existing button styles (recommended; it is a new bit of UI), or the browser's plain built-in dialog?
6. **Phones:** at zoom 1 a 24x32 chart is about 3.5 px per stitch on a phone, so precise touch editing needs zoom. I plan a short hint. Is phone editing a must-have for first review, or is a tablet / computer enough?

## 7. Backlog (not Stage 4)
Detail-density warning at setup; Illustration / Line-art mode (see `docs/research/README.md`); symmetry painting, region move, stamps.

**Scope decision (October 2026): Stage 5 is export only.** A downloaded grid is a flat image and that is the end of it. There is
no project file, no saving, no re-importing and no re-editing, so no storage and no file format to design. Edits live only while
the page is open, which is why 4C protects them.

## 8. Usability fix after 4B: Fit to Screen
The chart used to open at the width of the panel with a fixed 28rem-high scroll box, so tall charts needed scrolling both ways. Now:
- Zoom is still measured so that 1 = chart as wide as the preview. The **fit zoom** (`fitZoom` in `coords.ts`) is the largest zoom at which the whole chart fits the preview's width AND height (at most 1), rounded down so no edge can be cut off. It is the slider's minimum; the maximum is still 8.
- The preview box is as large as the chart, up to the available room (width of the panel, `previewHeight` = window height minus 280 px (330 px for the compact layout, 150 px for the sideways phone layout), 260-1100 px), so a fitted chart has no scrollbars and shows all four edges.
- New charts open fitted. While the chart is "fitted" it follows the preview (window resize, rotation). Once the person zooms in, their zoom is kept; it is only raised if the new fit is larger. Small height changes (a phone's address bar) are ignored.
- **Fit to Screen** button next to the slider returns to the whole chart and resets panning.
- Nothing in the matrix, converter, palette or editing logic changed.

## 9. Editor layout pass (responsive workspace)
- **Wide (900 px and up):** two columns. Chart, view toggle and the zoom / Fit to Screen bar on the left (about 2/3); Editing tools (Paint, Fill, Eyedropper, Pan), Undo / Redo, Yarn colors (a regular grid, hex and stitch count in every cell), utilities (edit count, Reset to converted) and a one-line hint on the right (about 1/3). Both columns are sticky; the sidebar scrolls by itself if it is taller than the screen. The chart column fits the screen height, and the chart is fitted inside it.
- **Phones and narrow tablets (under 900 px): a separate compact layout, not the sidebar stacked.** Header row with **Fit to Screen** and **Options**; the chart immediately below, fitted whole; a one-line caption (selected color + stitch count, summary or stitch/row under the finger); then a **dock that stays at the bottom of the screen**: the yarn colors in one swipeable row (selected color highlighted and kept in view) and one row with Paint, Fill, Pick (Eyedropper), Pan, then Undo and Redo. The view toggle, grid lines, zoom slider, edit count, Reset to converted and the help text live in the **Options** panel (closes with Escape or a tap outside). A new chart is scrolled to the top of the screen once it is laid out.
- **Phone held sideways (short and wide):** the dock becomes a column to the right of the chart (colors in a grid, tools in a 3 x 2 grid), so the chart is still shown whole.
- The chart section may be wider than the 32 rem form column from 40 rem up. Pan is now one of the four tools; choosing another tool returns to drawing. "Pick color" is labelled Eyedropper. Controls are at least 48 px tall.
- No conversion, matrix, palette or editing-behavior code changed. Decorative art from the mockup (botanical frames, stepper) was not added.

## 10. Stage 4C built (reliability and unsaved-edit protection)
**Protection.** `ChartView` reports how many stitches differ from the converted chart (`onEditedChange`). While that is above zero:
- Anything that would replace the chart asks first, in a small in-app dialog ("Replace your edited chart?", `ConfirmDiscard.tsx`, a native modal `<dialog>`):
  changing the picture, the crop, the orientation, the size or the maximum colors, and pressing Create My Crochet Grid again. It names the action
  and the number of edited stitches, opens with focus on **Keep editing**, Escape and clicking outside both keep the edits, and the page behind cannot be used.
  Reset to converted keeps its own existing confirmation.
- Closing or reloading the tab shows the browser's own "Leave this page?" prompt (browsers do not allow custom wording; some phones skip it when a tab is swiped away).
- If undo has removed every edit, nothing is lost, so nothing is asked. Once export exists (Stage 5), the warning can also stay quiet after a download.
- The decision logic is pure (`src/state/discardGuard.ts`, 8 tests); the React wiring is `useDiscardGuard.ts`.
- Found and fixed while testing: after answering "Keep editing" to a new-picture question, choosing the same file again did nothing (the file input still held it). The input is now cleared after each choice.

**Reliability tests.** `stress.test.ts` (16): twelve random 250-action sessions checked against a snapshot model after every step, including cancelled strokes and
the eyedropper, undo all the way back to the exact converted chart and redo all the way forward again; reset; and both history limits (500 actions, 1,000,000
stitches) shown to trim the oldest actions only, with the undo chain still exact. Mutation-checked: deliberately breaking undo, and the stitch budget, makes them fail.

**Performance** (`perf.test.ts`, 96 x 144 and 128 x 108, Node): a 3,000-move stroke 9-65 ms, whole-chart fill 3-11 ms, undo or redo of it 0.4-3 ms, 500 mixed actions 0.2-0.3 s,
undoing all of them 50-65 ms. In Chromium on the build machine, fill, undo and redo each show on screen in 85-108 ms (including the test driver's click latency). A phone will be slower; it has not been measured on a real phone.

**Browser checks.** `scripts/e2e/stage4c_browser.py`: the full confirmation flow on desktop and on an emulated phone (27 checks each), plus a speed check.

## 11. Stage 5A built (PNG export)

Scope: Stage 5 is export only (no saving, accounts or library). Digital-first: the PNG is the everyday export.
- `src/engine/export/pattern.ts`: pure pattern model (letters A, B, C in palette order, exact counts, finished inches, wording).
- `src/engine/export/png.ts`: pure layout and drawing against a tiny `Ctx2D`, so it is tested with a recording fake.
  Cell size is chosen under a 12,000,000-pixel budget (96 x 144 gives 27 x 24 px cells). Letters are printed in every
  stitch for black-and-white and color-blind use (`showLetters`).
- `src/lib/exportPng.ts`: off-screen canvas, `toBlob`, anchor download. `DownloadPanel` + a Download button in the phone bar and the desktop sidebar.
- Exports the live edited matrix, never a screenshot. Converter untouched. Service worker cache v20.

## 12. Stage 5B built (PDF export)

Digital-first: the PNG stays the simplest download; the PDF is the flexible one (read on screen or print). Tiled printing is optional and its help only appears when "Large print, tiled pages" is chosen.
- `src/engine/export/pdf/`: a hand-written vector PDF writer (Helvetica base-14 fonts, no images, no compression, deterministic bytes); the drawing is a list of plain instructions (`ops.ts`) that tests read directly.
- Fit to one page: whole chart on one US Letter page (portrait or landscape, whichever gives bigger stitches), key under it when it costs the chart under 10%, otherwise on page 2. Letters in stitches are printed only when stitches are tall enough to read (8.5 pt); otherwise a note says so.
- Large print: pages hold at most 27 x 38 stitches at the real gauge (18 x 16 pt per stitch), split into the fewest, most even parts, always between stitches. Page 1 is the overview (steps, assembly picture with page numbers and stitch ranges, color key). Each chart page: bold 3 pt alignment line on the edges that join, registration ticks at every 5th stitch line on both pages, "Joins page N" beside each joining edge, global column and row ranges, "you are here" mini map. No stitch is ever printed twice; the pages are trimmed along the bold line and butted together.
- Letters: PNG off by default, PDF on by default (both optional); the legend always has the letters.
- Tests: `pdf/pdf.test.ts` (52) plus `scripts/e2e/stage5b_browser.py` (reads the real downloaded PDFs with qpdf, pdftotext, pdftoppm). Service worker cache v21.

## 13. Stage 5C built (export checkpoint) and two follow-up changes

**Export checkpoint.** A successful download counts as "saved". `src/state/exportCheckpoint.ts`: the unsaved count is the smaller of (stitches that differ from the converted chart) and (stitches that differ from the chart as it was when the last download started). The snapshot is taken when the export starts, and is kept only if the browser download was actually started, so a failed export saves nothing and edits made while the export runs stay unsaved. A new conversion drops the checkpoint. The existing discard warning and leave-page prompt use the unsaved count, so they come back after any new edit; the dialog says "N hand-edited stitches since your last download" once a download exists. The status line shows "all downloaded" or "N not downloaded yet". There is no project saving, account or cloud (not in V1).
- Tests: `state/exportCheckpoint.test.ts` (12) and `scripts/e2e/stage5c_browser.py` (desktop and phone: edit, download, edit again, failed download, slowed export, undo back, Reset).

**Right-to-left numbering.** Tapestry rows are worked right to left on odd rows and left to right on even rows, so stitch 1 is at the RIGHT edge. Stitch numbers (hover label, PNG, PDF, tiled page ranges, heavy 10-lines and join ticks) now count from the right; row 1 is still the bottom. The picture itself is not mirrored. Printed note: "Odd rows: work right to left. Even rows: turn, work left to right."

**Buttons.** Download PNG is Honey Gold #E8B84F; Download PDF is the terracotta of the main button. Service worker cache v22.

## 14. Thin-line strengthening and Blank Canvas

**Strengthen thin lines** (opt-in, 16 x 20 and larger). `src/engine/strengthen/strengthen.ts` runs BEFORE the unchanged converter: it finds dark strokes thinner than about one stitch, widens them to roughly one stitch (never fusing two close lines), darkens them to the stroke's own darkest color and drops specks. It works on a copy of about 8 pixels per stitch (small pictures are enlarged up to 4x). `assessPicture` looks at how much of the picture is plain light paper; when it is not (a painting, a dark background) the setup screen adds a plain-language caution next to the checkbox instead of hiding the option. Ticking it counts as a setting change (it asks before discarding hand edits). Tested on 15 pictures; helps most on single-line drawings, is about even on dense black-and-white art, and hurts on colorful paintings and dark-background art.

**Blank Canvas (Start from Scratch).** An additional way to reach the SAME editor and exports.
- Setup screen: two cards, "Convert an Image" (unchanged, default) and "Start from Scratch" (orientation and the same six sizes, then "Open Blank Canvas"). Switching with a drawing on screen asks first.
- `src/engine/blank.ts`: an all-white `StitchMatrix` (every stitch holds palette index 0 = white) with a fixed ten-slot palette: white, black, red, blue, green, yellow, orange, brown, light gray, dark gray. Painting starts with black. Grid size comes from `buildGridSpec`, so the gauge and presets are the existing ones.
- Colors: any slot can be changed. `engine/editor/recolor.ts` + `EditorSession.recolor`: the stitches keep their palette index and the slot gets a new color, so every stitch using it changes (one undo step; Reset restores the starting colors). A color another slot already has is refused with a plain explanation. The "Edit this color" panel says how many stitches change and, for slot 0, that it is the background. It only acts on the button, never while a color picker is being dragged.
- `countDifferences` now also counts stitches whose yarn was recolored, so the discard warning and the download checkpoint notice a recolor.
- Blank charts use gray grid lines (white would vanish on white stitches); the Original view is not offered; Reset wording says "blank canvas".
- Exports are unchanged: unused colors are left out of the legend, so a blank canvas with three colors in use exports as three.
- Tests: `blank.test.ts`, `editor/recolor.test.ts`, `state/strengthenChoice.test.ts`, `strengthen/strengthen.test.ts`; browser: `scripts/e2e/blank_browser.py`, `strengthen_browser.py`. Service worker cache v23.

## 15. Responsive editor (rulers, highlight, phone layout)

- Rulers: stitch numbers above the chart (stitch 1 at the RIGHT, counting up leftward) and row numbers beside it (row 1 at the bottom, with a direction arrow: odd rows right to left, even rows left to right). Drawn on two small canvases (`components/Rulers.tsx`) from pure label math (`engine/editor/rulers.ts`), repainted on scroll one animation frame at a time; only visible labels, thinned to every 2nd/5th/10th when zoomed out, bold at multiples of 10. No numbers inside stitches.
- Highlight: a translucent gold row and column strip under the mouse or finger; the matching ruler numbers turn gold. Status line ends with the working direction.
- Phone: once a chart (blank or converted) is open the setup folds into a one-line bar ("Blank canvas · 12 × 16 in · Change") and the editor scrolls into view; Change/Hide toggles it. Page, panel and chart padding are tighter on phones so the chart is wider. Fit uses the room left after the rulers; it refits on rotation.
- Unchanged: converter, color reduction, stitch data, undo/redo, painting, fill, palette editing, PNG/PDF export.
- Browser checks: `scripts/e2e/rulers_browser.py`, `scripts/e2e/phone_editor_browser.py`.

## 16. Responsive design, Phase 1: page shell and setup

- The setup is the original single, vertically flowing column (starting-mode buttons side by side, then upload, orientation, size, Strengthen Lines, yarn colors, Create), centred at every screen size. Desktop width is only modestly larger than before: a 33rem card (about 480px of controls; it was about 430px). Phones use the available width with the tighter phone padding. The page container is fluid (max 100rem) so the editor can use larger screens independently.
- Once a chart is open the setup folds into the summary bar on every screen size. Change / Hide toggles it; folding never touches the chart and needs no confirmation. Replacing an edited chart still asks first.
- A two-column setup was tried and rejected; it is not in the code.
- Not touched: converter, stitch calculations, editor operations, export. Browser check: `scripts/e2e/responsive_setup_browser.py` (10 viewport sizes).

## 17. Responsive Editor Layout (Phase 2)

Once a chart opens, the editor is a workspace the height of the screen (under the setup bar, `100svh`), up to 100rem wide. The chart is fitted to the room its container actually has (`.chart__wrap` is measured with a ResizeObserver, width and height), replacing the old guessed `previewHeight()` constants. Stitch geometry, numbering, converter and editing/export code are untouched.

- Phone upright (<36rem): header buttons, chart, status line, dock of tools and colors; tight padding.
- Small tablet / phone sideways (36rem to 56.24rem): chart plus a slim 9.5rem rail of tools and colors (header buttons become icon-only, still 44px).
- Laptop and desktop (>=56.25rem): chart area plus a steady 21rem sidebar (title, view, tools, colors, download); sidebar scrolls on its own.
- Test: `scripts/e2e/editor_layout_browser.py` (10 viewports plus live resize/rotation).

## 18. Installed app, live resizing and rotation (Phase 3)

- Manifest: added `id`, `lang`, `display_override` (standalone, minimal-ui); orientation stays `any` (no rotation lock).
- Installed app: `overscroll-behavior: none` in standalone / minimal-ui / window-controls-overlay so painting and panning cannot trigger pull-to-refresh. `body` has a 17.5rem minimum width so a tiny app window scrolls instead of collapsing.
- Already in place and now tested: safe-area insets on the page and the editor workspace, `svh` workspace height (no resize wobble as a phone address bar hides), measured chart fitting via ResizeObserver.
- Test: `scripts/e2e/resize_browser.py` (10 odd window sizes up to 4K and down to 360x640 / 700x320, rotation sequences, zoomed-in then resized, a storm of 25 random resizes, resize in the middle of a brush stroke, no console errors).
- Service worker cache v28.

## 19. Saving projects (Phase 4a)

- Projects autosave to IndexedDB (`src/lib/projectStore.ts`): the project record and its picture are stored separately so frequent edits never rewrite the image. No account, nothing uploaded.
- File format `.gridcrow` (JSON, `src/engine/project/format.ts`, version 1): strictly validated on import; bad files show a plain message.
- Autosave runs 1.2 s after a change and immediately when the page is hidden. While a project is "Saved on this device" the discard-edits warnings stay quiet; if storage fails they return.
- Undo history is not saved. `progress` (stitches crocheted, working order) is stored now for the tracker.
- Tests: `format.test.ts`, `save_project_browser.py`. Tests about the discard warnings run with IndexedDB disabled.

## 20. Row and stitch tracker (Phase 4b)

- Edit | Track switch above the chart. In Track mode taps mark stitches instead of painting; drag and pinch still move around.
- Progress is one number (stitches crocheted, working order: row 1 at the bottom, stitch 1 on the right, odd rows right to left). Logic and tests: `src/engine/track/progress.ts`.
- Crocheted stitches are veiled, the row being worked is outlined in gold, the next stitch is boxed. Buttons: Next stitch, Back, Finish row, Start over. Tapping the last marked stitch again takes it back.
- Progress autosaves with the project and is included in the `.gridcrow` backup. Test: `scripts/e2e/tracker_browser.py`.

## 21. Yarn estimate (Phase 4c)

- `src/engine/yarn/estimate.ts`: a ROUGH range per color (low to high) from stitch counts. Assumes 8 to 12 times a stitch's width in yarn per single crochet (2 to 3 in at 4 stitches/inch; a rule of thumb scaled from a published double-crochet swatch example, not a measured single-crochet value), plus yarn carried inside stitches (one stitch width per carried stitch, between a color's first and last use in each row) and 15% extra for tails.
- Shown on screen (sidebar "Yarn estimate (rough)", phone Options) with an editable "Yards in one skein" (remembered on this device) and skeins rounded up from the high number.
- Printed in the PNG key (per color and in all) and every PDF key (fit, large print, compact), with a note that it is an estimate. The PNG pixel budget went from 12.0M to 12.5M so the biggest chart keeps its 27 px stitches.
- Tests: `estimate.test.ts`, `scripts/e2e/yarn_browser.py`.

## 22. Thumbnails, keep-storage request, footer (Phase 4d)

- My projects shows a small picture of each chart (`ProjectThumb`, one pixel per stitch, drawn from the stored current chart).
- After a successful save the app asks the browser to keep its saved data (`navigator.storage.persist`). Browsers may refuse, so the list says plainly to save a backup file of anything important.
- Footer: "Your pictures and projects stay on your device." plus a "Share feedback" link. The link shows only when `FEEDBACK_URL` in `src/config/links.ts` is set (paste the Discord invite there).

## 23. Add text tool

- `src/engine/text/fonts.ts`: two hand-built stitch fonts (Standard 5×7, Small 3×5): capitals, digits, `. , ! ? - : ' & + / ( )`. Lowercase prints as capitals; unsupported characters show as `?`. Size is a whole-number scale (×1–×4); Bold smears each letter one stitch; up to 4 lines, 60 characters. Words wrap to the chart width automatically.
- Text tool (Text button next to Pan): type, tap the chart to centre the lettering there, nudge with arrows, **Add to chart** stamps it in the selected yarn color as ONE undo step (`EditorSession.placeStitches`). While the panel is open the chart is for placing only (no painting). Text bigger than the chart is refused with a message.
- Tests: `fonts.test.ts`, e2e `text_browser.py`.
- Next: warn at conversion when text in the picture is too small to survive; optional text-protecting converter mode.

## 24. More presets, Quick Start / Manual Mode, custom gauge

- Presets are now eight: 6×8, 8×10, **9×16 (tall)**, **12×12 (square)**, 12×16, 16×20, 18×24, 24×32 inches. 9×16 landscape is 40.5 rows, rounded to 41.
- Setup has two tiles. **Quick Start** is picture conversion with the eight presets at the standard gauge (4 stitches and 4.5 rows per inch). **Manual Mode** opens its own page (with "Back to home") for your gauge and size, and is the only place to draw from scratch. The old Convert an Image / Draw from Scratch buttons are gone.
- Manual Mode page: 1) type a swatch (stitches and rows counted, inches measured) to get stitches and rows per inch (`gaugeFromSwatch`), with a "use the standard gauge" button; 2) finished width and height in inches, shown as stitches × rows (`parseManual` in `engine/manual.ts`, limit 200 stitches or rows a side); 3) Blank canvas or Pick a picture. The last swatch is remembered on the device.
- Gauge is a property of the chart: optional `gauge` on `StitchMatrix` (absent = standard, so older charts and projects are unchanged). It sets the stitch shape on screen, the finished size, the yarn estimate, PNG, all three PDF layouts (large print draws stitches at real size), thumbnails, and is saved in projects (`settings.custom`, `gauge` on each saved matrix).

## 25. Centimetres and metres (international)

- `src/engine/units.ts`: display-only units. Charts, projects and gauge stay in inches inside; the screen, setup, Manual Mode, size summary, PNG/PDF keys and yarn estimate switch to cm and metres. Gauge shows per 10 cm. Yarn shows metres (rounded up); the skein length is remembered per unit.
- A toggle (Inches / Centimetres) sits above the mode tiles. The default follows the browser language (US, Liberia, Myanmar: inches; everyone else: centimetres); the choice is remembered (`gridcrow-units`). Switching keeps typed measurements (converted).
- Preset labels in metric are rounded cm. Tests: `units.test.ts`, metric checks in `manual_browser.py`.

## 26. Strengthen Lines on 9 x 16

- Offered when the chart is 48+ stitches wide OR has 2500+ stitches in all, so the tall 9 x 16 (36 x 72) gets it while 6 x 8 and 8 x 10 do not. `strengthenOffered(cols, rows)`.

## 27. Foundation chain and row-by-row instructions

- Foundation chain = stitches in row 1 plus one turning chain (`foundationChain(cols)` in `engine/export/pattern.ts`): a 64 × 90 chart says "Chain 65." It depends only on the chart's width. It is never a chart row, and a turning chain is never a stitch (every row is exactly `cols` single crochet). Row 1 is RS ("starting in the second chain from the hook"), row 2 WS ("Chain 1, turn"), then "chain 1 and turn between rows".
- Shown as "Starting instructions" in the sidebar/phone panel (`StartInstructions.tsx`), as a paragraph in the PNG header and every PDF key.
- New PDF layout "Row-by-row instructions (written)" (`engine/export/rows.ts`, `pdf/rows.ts`): one line per row with number, RS/WS, direction and numbered color blocks in working order (odd rows right to left). Tests: `rows.test.ts`, `pattern.test.ts`.
- The PNG header carries a one-line version of the start; the full wording is in the PDFs and on screen. PNG pixel budget 12.0M to 12.5M (still well under phone canvas limits) so the biggest chart keeps 27 px stitches.
