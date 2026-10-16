# Browser checks (not part of `npm test`)

Scripts: `stage4a_browser.py`, `stage4b_browser.py`, `stage4c_browser.py` (replace-your-edited-chart confirmation, leave-page prompt, on-screen speed), `fit_browser.py` (Fit to Screen across all sizes, orientations and viewports) and `layout_browser.py` (responsive layout). `stage4a_browser.py` drives the real app in Chromium with Playwright (Python) on the minimalist sun card:
hover numbering, fast drags, Pan mode and Space-drag, Ctrl+wheel zoom anchoring, right click, reset, and emulated touch
(one-finger drag, tap, two-finger pinch, a second finger or a browser touch-cancel mid-stroke).

Needs: `npx vite --port 5173 --host 127.0.0.1` running, Playwright for Python with Chromium, and a PNG of the sun card
(`IMG` at the top of the script). It is emulated touch, not a real phone.
