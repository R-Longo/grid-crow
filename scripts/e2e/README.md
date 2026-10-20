# Browser checks (not part of `npm test`)

Scripts: `stage4a_browser.py`, `stage4b_browser.py`, `stage4c_browser.py` (replace-your-edited-chart confirmation, leave-page prompt, on-screen speed), `fit_browser.py` (Fit to Screen across all sizes, orientations and viewports) and `layout_browser.py` (responsive layout). `stage4a_browser.py` drives the real app in Chromium with Playwright (Python) on the minimalist sun card:
hover numbering, fast drags, Pan mode and Space-drag, Ctrl+wheel zoom anchoring, right click, reset, and emulated touch
(one-finger drag, tap, two-finger pinch, a second finger or a browser touch-cancel mid-stroke).

Needs: `npx vite --port 5173 --host 127.0.0.1` running, Playwright for Python with Chromium, and a PNG of the sun card
(`IMG` at the top of the script). It is emulated touch, not a real phone.

Stage 5: `stage5_browser.py desktop|mobile` downloads the real PNG and reads it back with Pillow and the `tesseract` CLI
(every stitch compared with the edited chart on screen, legend, numbering, row 1 at the bottom). `layout_probe.ts`
prints the PNG layout for a chart size: `npx vite-node scripts/e2e/layout_probe.ts 96 144 10`.

Stage 5B: `stage5b_browser.py desktop|mobile` downloads the real PDFs (Fit to one page and Large print) and checks them with `qpdf`, `pdftotext` and `pdftoppm`: every stitch against the edited chart on screen, page count, global ranges, joining lines and ticks. `pdf_probe.ts` prints where the PDF puts the chart on each page; `make_pdf.ts` writes a sample PDF from a synthetic chart.

Stage 5C: `stage5c_browser.py desktop|mobile` checks that a download becomes the saved checkpoint: the status line, the "since your last download" dialog, the leave-page prompt, a failed download (nothing is marked saved), and edits made during a slowed export. It imports helpers from `stage5_browser.py`, so run it from this folder without `-I`.

Blank Canvas: `blank_browser.py desktop|mobile` starts from scratch, paints, fills, picks, recolors a yarn (including the white background), checks the real PNG and PDF downloads, Reset, and the discard prompts. `strengthen_browser.py` checks the thin-line checkbox. Both need test pictures in `/tmp/claude-0/scratch/imgs/` (see the scripts).

- `rulers_browser.py` - rulers align with the chart at fit and when zoomed/scrolled; highlight; direction in the status line (desktop + phone).
- `phone_editor_browser.py` - setup folds into a bar on phones, chart size, 44 px targets, refit on rotation, Fit to Screen.
