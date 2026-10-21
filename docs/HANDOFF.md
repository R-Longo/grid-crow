# GridCrow development handoff (2026-10-20)

## 1. Completed and working
- Convert an Image pipeline (crop, orientation, 6 sizes 6x8 to 24x32, 4/6/8/10 yarn colors) and Draw from Scratch (Blank Canvas).
- Editor: paint, fill, eyedropper, pan, undo/redo, zoom, Fit to Screen, grid lines, Original view (pictures only), reset.
- Stitch numbering (stitch 1 right, row 1 bottom, odd rows right to left), rulers, row/column highlight, direction in status line.
- Strengthen Lines (12x16 and up), PNG and PDF exports, How-To, setup fold bar (Change/Hide) on all screens.
- Branding: Raven Noir, gold accents, new tagline (real text, Fraunces) under the logo.
- Responsive Phase 1 (setup: centered single column, 700px card on laptops) and Phase 2 (editor: measured fit, phone dock, tablet/sideways rail, laptop sidebar 21rem, up to 100rem wide).
- Color editor on BOTH Convert an Image and Draw from Scratch: recolor all stitches of a color, and (new) Add as a new color, up to 16 colors, undoable, included in PNG/PDF.
- Tests: 406 unit tests; browser suites all green (add_color 37, blank 90, stage4a 33, 4b 34, 4c 55, 5 45, 5b 60, 5c 40, strengthen 26, layout 99, editor_layout 113, fit 109, phone_editor 14, rulers 22, responsive_setup 150). Converter byte-identical to the approved version.

## 2. In progress
- Shared color editor: engine, UI, tests and exports are done; not yet seen by you in the live site or on a real phone.
- Responsive layout: Phase 2 awaiting your review on your own laptop and phone. Phase 3 not started.

## 3. Remaining work
- DONE (2026-10-21, awaiting upload): Phase 3 built and tested (see STAGE4_PLAN section 18). Original scope: installed-PWA window handling, live resize and rotation polish, safe areas, final cross-device testing.
- Review the new Add as a new color flow (wording, button order) on laptop and phone.
- Optional: delete the unused Inter font files from the repo (src/assets/fonts/inter-*).
- Rebuild service worker cache bump if more changes ship (currently v27).

- DONE (2026-10-21, awaiting upload): Compact PDF choice built and tested. Original plan was: add a "Compact, tiled pages" PDF choice beside "Large print, tiled pages". Stitches about 12pt tall so the 96x144 chart prints on about 10 pages instead of 17 (3x3 tiles + overview); keep Large print as is. Check overview page, joining lines, letters inside stitches, and the page-count note in the UI.

## 4. Known issues and open questions
- Portrait charts on landscape screens are limited by screen height (width cannot grow without distorting stitches).
- Tablet portrait leaves empty space below the chart (width-limited); status line sits at the bottom.
- Palette cap of 16 colors is my choice; tell me if you want a different limit.
- Netlify "Powered by" badge overlaps the bottom-right corner of the live site (Netlify, not GridCrow).
- Dev-only: local preview server stops itself now and then; restart it before running browser tests.

## 5. Recommended priorities
1. Build the Compact PDF choice (see section 3).
2. Push the latest zip and check the color editor live (laptop and phone).
3. Review Phase 2 editor feel; list tweaks.
4. Phase 3.
5. Cleanup (Inter files), final full regression, cache bump, deploy only on your approval.

## 6. Deployment status
- Netlify site gridcrow.netlify.app builds from R-Longo/grid-crow main; nothing has been deployed by Claude.
- Your repo already has Phase 1, Phase 2, tagline, Fraunces, padding changes (verified by fresh clone just now).
- NOT yet in your repo: the Add as a new color feature (files in gridcrow-add-color.zip: ChartView.tsx, ColorEditor.tsx, history.ts, recolor.ts, session.ts, global.css, addcolor.test.ts, add_color_browser.py, docs/HANDOFF.md).
- No git commits exist on my side (I cannot push); the working folder is the source of truth until you upload.
