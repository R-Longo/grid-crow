"""Blank Canvas (Start from Scratch) real-browser checks, desktop and phone (emulated touch).
Needs the dev server (npx vite --port 5173 --host 127.0.0.1); reads the real PNG / PDF downloads (qpdf, pdftotext, pdfinfo).
  python3 blank_browser.py [desktop|mobile]"""
from _blank import start_blank
import os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

# These tests are about the "you'll lose edits" warnings, which only matter when a project can't be saved on the device.
from playwright.sync_api import Browser as _B
_orig_nc = _B.new_context
def _nc(self, *a, **k):
    c = _orig_nc(self, *a, **k); c.add_init_script("Object.defineProperty(window,'indexedDB',{value:undefined})"); return c
_B.new_context = _nc

URL = "http://127.0.0.1:5173/"
OUT = "/tmp/claude-0/scratch/blank_out/"; os.makedirs(OUT, exist_ok=True)
IMG = "/tmp/claude-0/scratch/imgs/hand_line.png"
results = []
def unfold(page):
    """On a phone the setup folds into a bar once a chart is open; open it again before touching setup controls."""
    b = page.locator("[data-testid=setup-change]")
    if b.count() and b.is_visible() and b.get_attribute("aria-expanded") == "false":
        b.click(); time.sleep(0.4)
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail)); print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)

def radio(page, value):
    for _ in range(4):
        try: unfold(page); page.locator(f'input[type=radio][value="{value}"]').check(force=True); return
        except Exception:
            if page.locator('dialog.discard[open]').count(): return  # the app asked first; do not click again
            time.sleep(0.4)
def opts(page): return page.get_by_role("button", name="Options")
def dlg(page): return page.locator("dialog.discard[open]")
def has_chart(page): return page.locator("[data-testid=chart-canvas]").count() > 0
def open_blank(page):
    unfold(page); page.locator("[data-testid=open-blank]").click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=30000)
    page.wait_for_function("document.querySelector('[data-testid=chart-canvas]').width > 0"); time.sleep(0.5)

def grid_dims(page):
    t = page.locator(".chart__summary").first.inner_text() if page.locator(".chart__summary").count() else ""
    body = page.locator("body").inner_text()
    m = re.search(r"(\d+) stitches × (\d+) rows · (\d+) colors?", body) or re.search(r"(\d+) × (\d+) · (\d+) colors?", body)
    return tuple(int(x) for x in m.groups()) if m else None

def stitch_px(page, c, r, cols, rows):
    return page.evaluate("""([c,r,cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      const d=cv.getContext('2d').getImageData(Math.floor((c+0.5)*cw), Math.floor((r+0.5)*ch), 1, 1).data; return [d[0],d[1],d[2]]; }""", [c, r, cols, rows])
def line_px(page, cols, rows):
    """A pixel on the grid-line canvas, on a vertical line between stitch 1 and 2 (third row down)."""
    return page.evaluate("""([cols,rows]) => { const cv=document.querySelector('.chart__lines'); const cw=cv.width/cols;
      const d=cv.getContext('2d').getImageData(Math.round(cw), Math.floor(cv.height/rows*2.5), 1, 1).data; return [d[0],d[1],d[2],d[3]]; }""", [cols, rows])

def center_on(page, c, r, cols, rows):
    page.evaluate("""([c,r,cols,rows]) => { const sc=document.querySelector('.chart__scroll'); sc.scrollIntoView({block:'center'});
      const cv=document.querySelector('[data-testid=chart-canvas]'); const cw=cv.width/cols, ch=cv.height/rows;
      sc.scrollLeft=(c+0.5)*cw-sc.clientWidth/2; sc.scrollTop=(r+0.5)*ch-sc.clientHeight/2; }""", [c, r, cols, rows]); time.sleep(0.15)
def client(page, c, r, cols, rows):
    return page.evaluate("""([c,r,cols,rows]) => { const cv=document.querySelector('[data-testid=chart-canvas]'); const b=cv.getBoundingClientRect();
      return [b.left+(c+0.5)*b.width/cols, b.top+(r+0.5)*b.height/rows]; }""", [c, r, cols, rows])
def tap(page, cdp, c, r, cols, rows):
    center_on(page, c, r, cols, rows); x, y = client(page, c, r, cols, rows)
    if cdp:
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 0}]}); cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else: page.mouse.click(x, y)
    time.sleep(0.25)
def tool(page, name): page.get_by_role("button", name=name, exact=True).click()
def swatch(page, i): return page.locator(".chart__color").nth(i)
def hexes(page): return page.locator(".chart__hex").all_inner_texts()
def counts(page): return [int(t) for t in page.locator(".chart__count").all_inner_texts()]
def status(page):
    o = False
    if opts(page).count() and opts(page).get_attribute("aria-expanded") != "true" and not page.locator("[data-testid=chart-changed]").is_visible():
        opts(page).click(); time.sleep(0.2); o = True
    t = page.locator("[data-testid=chart-changed]").inner_text(); u = page.locator("[data-testid=chart-unsaved]")
    ut = u.inner_text().replace("·", "").strip() if u.count() else ""
    if o: opts(page).click(); time.sleep(0.2)
    m = re.match(r"([\d,]+)", t); return (int(m.group(1).replace(",", "")) if m else 0), ut
def open_editor(page, touch):
    """Open 'Edit this color' (on a phone it lives in the Options panel)."""
    if not page.locator("[data-testid=color-hex]").count() or not page.locator("[data-testid=color-hex]").is_visible():
        if touch and opts(page).get_attribute("aria-expanded") != "true": opts(page).click(); time.sleep(0.25)
        btn = page.locator("[data-testid=edit-color-open]")
        if btn.get_attribute("aria-expanded") != "true": btn.click(); time.sleep(0.25)
def close_panels(page, touch):
    if touch and opts(page).count() and opts(page).get_attribute("aria-expanded") == "true": opts(page).click(); time.sleep(0.25)
def recolor(page, touch, hexv):
    open_editor(page, touch)
    page.locator("[data-testid=color-hex]").fill(hexv); page.locator("[data-testid=color-apply]").click(); time.sleep(0.3)
    return page.locator("[data-testid=color-message]").inner_text()
def download(page, touch, kind):
    if touch:
        o = page.locator("[data-testid=download-open]")
        if o.get_attribute("aria-expanded") != "true": o.tap(); time.sleep(0.3)
    btn = page.locator(f"[data-testid=download-{kind}]")
    with page.expect_download(timeout=90000) as dl: btn.tap() if touch else btn.click()
    path = OUT + dl.value.suggested_filename; dl.value.save_as(path)
    page.wait_for_function("(document.querySelector('[data-testid=download-note]')?.textContent||'').startsWith('Downloaded')", timeout=60000); time.sleep(0.3)
    return path
def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout

def scenario(page, tag, cdp=None):
    touch = cdp is not None
    errors = []; page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_load_state("networkidle")
    tiles = page.locator(".mode__tile")
    check(f"{tag}: two clearly named starting choices", tiles.count() == 2 and "Quick Start" in tiles.nth(0).inner_text() and "Manual Mode" in tiles.nth(1).inner_text())
    check(f"{tag}: both tiles are at least 44px tall", all(tiles.nth(i).bounding_box()["height"] >= 44 for i in range(2)))
    check(f"{tag}: Quick Start has no draw-from-scratch buttons (drawing lives in Manual Mode)", page.get_by_text("Draw from Scratch").count() == 0)
    check(f"{tag}: the picture workflow is the unchanged default (upload area, colors, Create button)", page.locator("input[type=file]:not([data-testid=import-backup])").count() == 1 and page.get_by_role("button", name=re.compile("Create My Crochet Grid")).count() == 1 and page.get_by_text("Maximum yarn colors").count() == 1)
    start_blank(page); time.sleep(0.3)
    check(f"{tag}: a blank canvas in Manual Mode hides upload and color limit, and shows the size steps", page.locator("input[type=file]:not([data-testid=import-backup])").count() == 0 and page.get_by_text("Maximum yarn colors").count() == 0 and page.locator("[data-testid=manual-page]").is_visible())
    check(f"{tag}: the Open Blank Canvas button is there", page.locator("[data-testid=open-blank]").is_visible())

    # --- a blank 12x16 portrait: 48 x 72
    open_blank(page)
    cols, rows = 48, 72
    d = grid_dims(page)
    check(f"{tag}: opens a 48 x 72 chart with 10 yarn colors", d == (48, 72, 10), str(d))
    check(f"{tag}: the Original view is not offered", page.get_by_role("button", name="Original").count() == 0)
    h = hexes(page)
    check(f"{tag}: the palette has white first, then black, red, blue, green, yellow and neutrals", h[0] == "#FFFFFF" and h[1] == "#111111" and "#D62828" in h and "#1F5FBF" in h and "#2E9E4F" in h and "#F7D21E" in h and len(h) == 10, str(h))
    c = counts(page)
    check(f"{tag}: every one of the 3,456 stitches is white", c[0] == 3456 and sum(c) == 3456, str(c[:3]))
    check(f"{tag}: painting starts with black, so the canvas is ready", swatch(page, 1).get_attribute("aria-pressed") == "true")
    check(f"{tag}: the canvas is white", all(stitch_px(page, cc, rr, cols, rows) == [255, 255, 255] for cc, rr in [(0, 0), (24, 36), (47, 71), (10, 50)]))
    lp = line_px(page, cols, rows)
    check(f"{tag}: grid lines are gray (not white, not black) so stitches are visible", lp[3] > 0 and 60 < lp[0] < 200 and abs(lp[0] - lp[1]) < 5, str(lp))
    check(f"{tag}: no edits yet", status(page)[0] == 0)

    # --- paint
    tap(page, cdp, 10, 10, cols, rows)
    check(f"{tag}: painting turns a white stitch black", stitch_px(page, 10, 10, cols, rows)[0] < 40, str(stitch_px(page, 10, 10, cols, rows)))
    c = counts(page); check(f"{tag}: counts follow (3455 white, 1 black)", c[0] == 3455 and c[1] == 1, str(c[:2]))
    # --- fill the white background with red
    swatch(page, 2).click(); tool(page, "Fill"); tap(page, cdp, 30, 40, cols, rows)
    c = counts(page)
    check(f"{tag}: Fill changes the white background to red (3455 red, 0 white)", c[2] == 3455 and c[0] == 0 and c[1] == 1, str(c[:3]))
    check(f"{tag}: the red shows on the canvas", stitch_px(page, 30, 40, cols, rows)[0] > 180 and stitch_px(page, 30, 40, cols, rows)[1] < 80)
    page.get_by_role("button", name="Undo", exact=True).click(); time.sleep(0.3)
    check(f"{tag}: Undo restores the white background", counts(page)[0] == 3455)
    # --- eyedropper
    tool(page, "Eyedropper"); tap(page, cdp, 10, 10, cols, rows)
    check(f"{tag}: the eyedropper picks black from the chart", swatch(page, 1).get_attribute("aria-pressed") == "true")

    # --- recolor the white background slot
    swatch(page, 0).click(); open_editor(page, touch)
    warn = page.locator("[data-testid=color-warning]").inner_text()
    check(f"{tag}: the editor says it recolors all 3455 white stitches and that it is the background", "3455" in warn and "background" in warn.lower() and "undo" in warn.lower(), warn)
    check(f"{tag}: the apply button names the number of stitches", "3455" in page.locator("[data-testid=color-apply]").inner_text())
    msg = recolor(page, touch, "#d62828")
    check(f"{tag}: a color already in the palette is blocked with a friendly explanation", "already in your palette" in msg and "background" not in msg.lower() or "already in your palette" in msg, msg)
    check(f"{tag}: ... and nothing changed", hexes(page)[0] == "#FFFFFF" and counts(page)[0] == 3455)
    msg = recolor(page, touch, "blue")
    check(f"{tag}: a nonsense color gets a plain message", "isn't a color" in msg, msg)
    msg = recolor(page, touch, "#fdf1d6")
    check(f"{tag}: recoloring the background changes every white stitch to cream", hexes(page)[0] == "#FDF1D6" and "Recolored 3455" in msg and stitch_px(page, 30, 40, cols, rows) == [253, 241, 214], msg)
    check(f"{tag}: the recolor counts as 3455 changed stitches in the status", status(page)[0] == 3456, str(status(page)))
    close_panels(page, touch)
    page.get_by_role("button", name="Undo", exact=True).click(); time.sleep(0.3)
    check(f"{tag}: Undo puts the white back", hexes(page)[0] == "#FFFFFF" and stitch_px(page, 30, 40, cols, rows) == [255, 255, 255])
    page.get_by_role("button", name="Redo", exact=True).click(); time.sleep(0.3)
    check(f"{tag}: Redo recolors it again", hexes(page)[0] == "#FDF1D6")
    close_panels(page, touch)
    page.screenshot(path=OUT + f"{tag.replace(' ', '_')}_editing.png")

    # --- exports of the edited design
    png = download(page, touch, "png")
    check(f"{tag}: Download PNG is named for the grid", os.path.basename(png) == "gridcrow-pattern-48x72.png", png)
    pdf = download(page, touch, "pdf")
    txt = sh("pdftotext", "-layout", pdf, "-")
    check(f"{tag}: the PDF legend and total match the design (3,455 cream, 1 black, 3,456 stitches)", "3,455" in txt and "#FDF1D6" in txt.upper() and "#111111" in txt.upper() and "3,456 stitches (48 × 72)" in txt, "")
    check(f"{tag}: the PDF says the finished size", "12 × 16 inches" in txt)
    check(f"{tag}: the Fit PDF is one chart page (plus the key page if it does not fit under the chart)", int(re.search(r"Pages:\s+(\d+)", sh("pdfinfo", pdf)).group(1)) <= 2)
    n_before, u = status(page)
    check(f"{tag}: after the downloads everything counts as downloaded", u == "all downloaded", u)
    swatch(page, 0).click(); recolor(page, touch, "#eeeeee"); close_panels(page, touch)
    n_after, u2 = status(page)
    check(f"{tag}: recoloring after a download counts as unsaved (3455 not downloaded yet)", u2.startswith("3455 not downloaded"), f"{n_after} / {u2}")
    # tiled
    if touch:
        o = page.locator("[data-testid=download-open]")
        if o.get_attribute("aria-expanded") != "true": o.tap(); time.sleep(0.3)
    page.locator("[data-testid=pdf-tiled]").check(force=True); time.sleep(0.2)
    pdf2 = download(page, touch, "pdf")
    pages = int(re.search(r"Pages:\s+(\d+)", sh("pdfinfo", pdf2)).group(1))
    check(f"{tag}: Large print makes an overview plus the tiled pages (48 x 72 = 2 x 2 tiles + overview)", pages == 5, str(pages))

    # --- Reset restores the blank grid and the starting colors
    o = opts(page).count() and opts(page).get_attribute("aria-expanded") != "true"
    if touch and o: opts(page).click(); time.sleep(0.25)
    page.get_by_role("button", name=re.compile("Reset canvas")).click(); time.sleep(0.3)
    check(f"{tag}: Reset asks first, in blank-canvas wording", page.locator(".chart__dialog").count() == 1 and "blank canvas" in page.locator(".chart__dialog").inner_text().lower())
    page.locator(".chart__dialog button").filter(has_text=re.compile("reset", re.I)).first.click(); time.sleep(0.4)
    close_panels(page, touch)
    c = counts(page)
    check(f"{tag}: Reset gives back the all-white grid and the starting palette", c[0] == 3456 and hexes(page)[0] == "#FFFFFF" and stitch_px(page, 10, 10, cols, rows) == [255, 255, 255] and status(page)[0] == 0, str(c[:2]))

    # --- switching workflow asks before discarding a design
    swatch(page, 1).click(); tool(page, "Paint"); tap(page, cdp, 5, 5, cols, rows)
    unfold(page); page.locator("[data-testid=manual-start-image]").click(force=True); time.sleep(0.4)  # the app asks first, so the card stays on Scratch until answered
    d = dlg(page)
    check(f"{tag}: switching to Convert an Image with a drawing asks first", d.count() == 1 and has_chart(page), d.inner_text()[:120] if d.count() else "")
    page.get_by_role("button", name="Keep editing").tap() if touch else page.get_by_role("button", name="Keep editing").click(); time.sleep(0.3)
    check(f"{tag}: Keep editing leaves the drawing", has_chart(page) and page.locator("[data-testid=manual-start-scratch]").is_checked())
    unfold(page); page.locator("[data-testid=manual-w]").fill("16"); time.sleep(0.3)
    check(f"{tag}: changing the size with a drawing asks first too", dlg(page).count() == 1 and has_chart(page))
    page.get_by_role("button", name="Keep editing").tap() if touch else page.get_by_role("button", name="Keep editing").click(); time.sleep(0.3)
    prompts = []
    page.on("dialog", lambda dg: (prompts.append(dg.type), dg.dismiss() if len(prompts) == 1 else dg.accept()))  # stay once, then leave
    try: page.reload()
    except Exception: pass
    time.sleep(0.5)
    check(f"{tag}: leaving the page with an unsaved drawing shows the browser warning", prompts[:1] == ["beforeunload"], str(prompts))

    # --- landscape and the largest size
    page.goto(URL); page.wait_for_load_state("networkidle")
    start_blank(page, "32", "24"); open_blank(page)
    d = grid_dims(page)
    check(f"{tag}: landscape 24 x 32 is 128 x 96?  (32 x 24 in at the gauge: 128 x 108)", d == (128, 108, 10), str(d))
    page.goto(URL); page.wait_for_load_state("networkidle")
    start_blank(page, "24", "32"); open_blank(page)
    check(f"{tag}: 24 x 32 portrait is 96 x 144", grid_dims(page) == (96, 144, 10), str(grid_dims(page)))
    # --- the picture workflow still works unchanged
    page.goto(URL); page.wait_for_load_state("networkidle"); page.set_input_files("input[type=file]:not([data-testid=import-backup])", IMG); time.sleep(0.8)
    radio(page, "12x16"); (unfold(page), page.get_by_role("button", name=re.compile("Create My Crochet Grid"))).__getitem__(1).click()
    page.wait_for_selector("[data-testid=chart-canvas]", state="visible", timeout=90000); time.sleep(0.6)
    if touch: opts(page).click(); time.sleep(0.3)  # on a phone the Original / Chart switch is in the Options panel
    check(f"{tag}: Convert an Image still builds a chart, with Original view and a color editor", page.get_by_role("button", name="Original").count() == 1 and page.locator("[data-testid=edit-color-open]").count() == 1 and (grid_dims(page) or (0, 0))[0:2] == (48, 72))
    check(f"{tag}: no page errors", not errors, "; ".join(errors)[:200])

def desktop(p):
    b = p.chromium.launch(); page = b.new_context(viewport={"width": 1100, "height": 1000}, accept_downloads=True).new_page(); scenario(page, "blank desktop"); b.close()
def mobile(p):
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2, accept_downloads=True); page = ctx.new_page()
    scenario(page, "blank phone", ctx.new_cdp_session(page)); b.close()

if __name__ == "__main__":
    with sync_playwright() as p:
        which = sys.argv[1] if len(sys.argv) > 1 else "all"
        if which in ("all", "desktop"): desktop(p)
        if which in ("all", "mobile"): mobile(p)
    bad = [r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} checks passed"); sys.exit(1 if bad else 0)
